import type { EnglishBook } from '../types'

export async function enrichFromExtras(book: EnglishBook): Promise<Partial<EnglishBook>> {
  const inferred: Partial<EnglishBook> = {}

  if (!book.language) {
    inferred.language = 'en'
  }

  return inferred
}
