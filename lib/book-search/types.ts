export type BookLanguage = 'en' | 'other'

export type EnglishBookFormat =
  | 'paperback'
  | 'hardcover'
  | 'mass_market_paperback'
  | 'audio_cd'
  | 'audiobook'
  | 'kindle'
  | 'ebook'
  | 'unknown'

export type EnglishBookEdition = {
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

export type EnglishBookGroup = {
  groupId: string
  title: string
  series?: string
  authors: string[]
  cover?: string
  summary?: string
  editions: EnglishBookEdition[]
}

export const LOANABLE_FORMATS: EnglishBookFormat[] = [
  'paperback',
  'hardcover',
  'mass_market_paperback',
  'audio_cd',
]

export function isLoanableFormat(format?: EnglishBookFormat): boolean {
  return !!format && LOANABLE_FORMATS.includes(format)
}
