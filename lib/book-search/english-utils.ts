import type { EnglishBook } from './types'

const SPECIAL_EDITION_KEYWORDS = [
  'special edition',
  'deluxe',
  'anniversary',
  'collector',
  'illustrated edition',
  'signed edition',
  'limited edition',
]

const NON_AUTHOR_ROLE_KEYWORDS = [
  'illustrator',
  'editor',
  'translator',
  'foreword',
  'introduction',
  'afterword',
  'contributor',
]

export function normalizeText(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function cleanAuthors(authors: string[] | undefined): string[] {
  if (!authors?.length) return []

  return Array.from(
    new Set(
      authors
        .map((a) => a.trim())
        .filter(Boolean)
        .filter((a) => {
          const n = normalizeText(a)
          return !NON_AUTHOR_ROLE_KEYWORDS.some((keyword) => n.includes(keyword))
        }),
    ),
  )
}

export function looksLikeSpecialEdition(title: string | undefined): boolean {
  const normalized = normalizeText(title)
  return SPECIAL_EDITION_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

export function isSufficientlyComplete(book: EnglishBook): boolean {
  let score = 0

  if (book.title) score += 3
  if (book.authors?.length) score += 2
  if (book.summary) score += 2
  if (book.publisher) score += 1
  if (book.publishedDate) score += 1
  if (book.cover) score += 1
  if (book.isbn || book.isbn13) score += 2
  if (book.pageCount) score += 1
  if (book.genres?.length) score += 1

  return score >= 9
}

export function mergeMissingFields(base: EnglishBook, enrichment: Partial<EnglishBook>, provider: string): EnglishBook {
  const merged: EnglishBook = { ...base }

  const fields: Array<keyof EnglishBook> = [
    'title',
    'series',
    'summary',
    'isbn',
    'isbn13',
    'language',
    'cover',
    'publisher',
    'publishedDate',
    'pageCount',
  ]

  for (const field of fields) {
    const existing = merged[field]
    const incoming = enrichment[field]

    if ((existing === undefined || existing === null || existing === '') && incoming !== undefined && incoming !== null && incoming !== '') {
      merged[field] = incoming as never
    }
  }

  if (!merged.authors?.length && enrichment.authors?.length) {
    merged.authors = cleanAuthors(enrichment.authors)
  }

  if (!merged.genres?.length && enrichment.genres?.length) {
    merged.genres = Array.from(new Set(enrichment.genres.map((genre) => genre.trim()).filter(Boolean)))
  }

  merged.sourceRefs = {
    ...(merged.sourceRefs ?? {}),
    ...(enrichment.sourceRefs ?? {}),
  }

  merged.sourceTrace = [...(merged.sourceTrace ?? []), provider]

  return merged
}

function normalizeIsbn(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/[^0-9Xx]/g, '').toUpperCase()
  return normalized || undefined
}

export function hardDedupeEnglishBooks(books: EnglishBook[]): EnglishBook[] {
  const byKey = new Map<string, EnglishBook>()

  for (const book of books) {
    const isbn13 = normalizeIsbn(book.isbn13)
    const isbn10 = normalizeIsbn(book.isbn)
    const editionId = normalizeText(book.sourceEditionId)

    const key = isbn13 ? `isbn13:${isbn13}` : isbn10 ? `isbn10:${isbn10}` : editionId ? `edition:${editionId}` : undefined

    if (!key) {
      byKey.set(`fallback:${book.title}:${book.authors[0] ?? ''}:${Math.random()}`, book)
      continue
    }

    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, book)
      continue
    }

    const pickExisting = score(existing) >= score(book)
    byKey.set(key, pickExisting ? existing : book)
  }

  return Array.from(byKey.values())
}

function score(book: EnglishBook): number {
  let s = 0
  if (book.summary) s += 2
  if (book.isbn || book.isbn13) s += 2
  if (book.cover) s += 1
  if (book.publisher) s += 1
  if (book.publishedDate) s += 1
  if (book.pageCount) s += 1
  if (book.genres?.length) s += 1
  return s
}

export function collapseFormatVariants(books: EnglishBook[]): EnglishBook[] {
  const collapsed = new Map<string, EnglishBook>()

  for (const book of books) {
    const title = normalizeText(book.title).replace(/\((paperback|hardcover|kindle|ebook)\)/g, '').trim()
    const primaryAuthor = normalizeText(book.authors?.[0])
    const publisher = normalizeText(book.publisher)
    const year = (book.publishedDate ?? '').slice(0, 4)

    const formatSensitive = looksLikeSpecialEdition(book.title)
    const key = formatSensitive
      ? `special:${title}:${primaryAuthor}:${publisher}:${year}`
      : `normal:${title}:${primaryAuthor}:${publisher}:${year}`

    const existing = collapsed.get(key)
    if (!existing) {
      collapsed.set(key, book)
      continue
    }

    const pickExisting = score(existing) >= score(book)
    collapsed.set(key, pickExisting ? existing : book)
  }

  return Array.from(collapsed.values())
}
