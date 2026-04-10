import type { EnglishBook } from '../types'
import { cleanAuthors } from '../english-utils'

type GoogleVolumeItem = {
  id: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    description?: string
    categories?: string[]
    industryIdentifiers?: Array<{ type: string; identifier: string }>
    language?: string
    imageLinks?: { thumbnail?: string; smallThumbnail?: string }
    publisher?: string
    publishedDate?: string
    pageCount?: number
    seriesInfo?: { bookDisplayNumber?: string; series?: Array<{ seriesBookType?: string; title?: string }> }
  }
}

type GoogleApiResponse = {
  items?: GoogleVolumeItem[]
}

function pickBestGoogleItem(items: GoogleVolumeItem[], title: string): GoogleVolumeItem {
  const t = title.toLowerCase()
  return items
    .slice()
    .sort((a, b) => {
      const aTitle = (a.volumeInfo?.title ?? '').toLowerCase()
      const bTitle = (b.volumeInfo?.title ?? '').toLowerCase()
      const aScore = aTitle.includes(t) ? 1 : 0
      const bScore = bTitle.includes(t) ? 1 : 0
      return bScore - aScore
    })[0]
}

export async function enrichFromGoogle(book: EnglishBook): Promise<Partial<EnglishBook>> {
  const queryParts = [book.isbn13, book.isbn, book.title, book.authors?.[0]].filter(Boolean)
  if (!queryParts.length) return {}

  const url = new URL('https://www.googleapis.com/books/v1/volumes')
  url.searchParams.set('q', queryParts.join(' '))
  url.searchParams.set('maxResults', '5')

  const response = await fetch(url.toString(), { cache: 'no-store' })
  if (!response.ok) return {}

  const data = (await response.json()) as GoogleApiResponse
  if (!data.items?.length) return {}

  const best = pickBestGoogleItem(data.items, book.title)
  const info = best.volumeInfo
  if (!info) return {}

  const isbn = info.industryIdentifiers?.find((identifier) => identifier.type === 'ISBN_10')?.identifier
  const isbn13 = info.industryIdentifiers?.find((identifier) => identifier.type === 'ISBN_13')?.identifier
  const series = info.seriesInfo?.series?.[0]?.title || info.subtitle

  return {
    title: info.title,
    series,
    authors: cleanAuthors(info.authors),
    summary: info.description,
    genres: info.categories ?? [],
    isbn,
    isbn13,
    language: info.language,
    cover: info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail,
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    pageCount: info.pageCount,
    sourceRefs: {
      googleVolumeId: best.id,
    },
  }
}
