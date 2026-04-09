import type { EnglishBook } from '../types'
import { cleanAuthors } from '../english-utils'

type OpenLibraryDoc = {
  title?: string
  author_name?: string[]
  first_publish_year?: number
  publisher?: string[]
  language?: string[]
  isbn?: string[]
  cover_i?: number
  subject?: string[]
  key?: string
}

type OpenLibraryResponse = {
  docs?: OpenLibraryDoc[]
}

function pickBestDoc(docs: OpenLibraryDoc[], title: string): OpenLibraryDoc | undefined {
  const t = title.toLowerCase()
  return docs
    .slice()
    .sort((a, b) => {
      const aScore = (a.title ?? '').toLowerCase().includes(t) ? 1 : 0
      const bScore = (b.title ?? '').toLowerCase().includes(t) ? 1 : 0
      return bScore - aScore
    })[0]
}

export async function enrichFromOpenLibrary(book: EnglishBook): Promise<Partial<EnglishBook>> {
  const url = new URL('https://openlibrary.org/search.json')

  if (book.isbn13 || book.isbn) {
    url.searchParams.set('isbn', book.isbn13 ?? book.isbn ?? '')
  } else {
    url.searchParams.set('title', book.title)
    if (book.authors?.[0]) {
      url.searchParams.set('author', book.authors[0])
    }
  }

  url.searchParams.set('limit', '5')

  const response = await fetch(url.toString(), { cache: 'no-store' })
  if (!response.ok) return {}

  const data = (await response.json()) as OpenLibraryResponse
  if (!data.docs?.length) return {}

  const doc = pickBestDoc(data.docs, book.title)
  if (!doc) return {}

  const isbn13 = doc.isbn?.find((candidate) => candidate.replace(/[^0-9]/g, '').length === 13)
  const isbn10 = doc.isbn?.find((candidate) => candidate.replace(/[^0-9Xx]/g, '').length === 10)
  const cover = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined
  const isEnglish = doc.language?.some((code) => code.toLowerCase().includes('eng'))

  return {
    title: doc.title,
    authors: cleanAuthors(doc.author_name),
    genres: doc.subject?.slice(0, 10) ?? [],
    isbn: isbn10,
    isbn13,
    language: isEnglish ? 'en' : undefined,
    cover,
    publisher: doc.publisher?.[0],
    publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
    sourceRefs: {
      openLibraryWorkKey: doc.key,
    },
  }
}
