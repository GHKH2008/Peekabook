import type { EnglishBook } from '../types'
import { cleanAuthors } from '../english-utils'

const GOODREADS_SEARCH_URL = 'https://www.goodreads.com/search'
const GOODREADS_HOST = 'https://www.goodreads.com'

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function cleanString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const lowered = trimmed.toLowerCase()

  if (
    lowered === 'unknown' ||
    lowered === 'n/a' ||
    lowered === 'not available' ||
    lowered === 'none' ||
    lowered === 'null' ||
    lowered === 'undefined'
  ) {
    return undefined
  }

  return trimmed
}

function cleanPageCount(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0) return undefined
  return Math.floor(value)
}

function getBookRows(html: string): string[] {
  const rows = html.match(/<tr[^>]*itemtype="http:\/\/schema\.org\/Book"[\s\S]*?<\/tr>/gi)
  if (rows?.length) return rows

  return html.match(/<tr[^>]*>\s*[\s\S]*?bookTitle[\s\S]*?<\/tr>/gi) ?? []
}

function parseSearchRow(rowHtml: string): Partial<EnglishBook> | undefined {
  const bookHrefMatch = rowHtml.match(/href="(\/book\/show\/[^"]+)"/i)
  const bookHref = bookHrefMatch?.[1]
  if (!bookHref) return undefined

  const idMatch = bookHref.match(/\/book\/show\/(\d+)/i)
  const goodreadsBookId = idMatch?.[1]

  const workHrefMatch = rowHtml.match(/href="(\/work\/editions\/(\d+)[^"]*)"/i)
  const goodreadsWorkId = workHrefMatch?.[2]

  const titleMatch = rowHtml.match(/class="[^"]*bookTitle[^"]*"[\s\S]*?>([\s\S]*?)<\/a>/i)
  const title = cleanString(stripTags(titleMatch?.[1] ?? ''))
  if (!title) return undefined

  const authorMatches = Array.from(rowHtml.matchAll(/class="[^"]*authorName[^"]*"[\s\S]*?>([\s\S]*?)<\/a>/gi)).map((m) =>
    stripTags(m[1]),
  )

  const coverMatch = rowHtml.match(/<img[^>]+src="([^"]+)"/i)

  return {
    title,
    authors: cleanAuthors(authorMatches),
    cover: cleanString(coverMatch?.[1]),
    sourceEditionId: goodreadsBookId ? `goodreads:${goodreadsBookId}` : undefined,
    sourceRefs: {
      goodreadsBookId,
      goodreadsWorkId,
    },
  }
}

function parseJsonLdBook(html: string): Partial<EnglishBook> {
  const scriptMatches = Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi))

  for (const match of scriptMatches) {
    const text = match[1]?.trim()
    if (!text) continue

    try {
      const parsed = JSON.parse(text) as Record<string, unknown> | Array<Record<string, unknown>>
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      const bookNode = nodes.find((node) => {
        const type = node['@type']
        return type === 'Book' || (Array.isArray(type) && type.includes('Book'))
      })

      if (!bookNode) continue

      const rawAuthors = bookNode.author
      const authors = Array.isArray(rawAuthors)
        ? rawAuthors
            .map((author) => {
              if (!author || typeof author !== 'object') return undefined
              const name = (author as { name?: string }).name
              return cleanString(name)
            })
            .filter((name): name is string => Boolean(name))
        : []

      const pageCandidate =
        typeof bookNode.numberOfPages === 'string'
          ? Number(bookNode.numberOfPages.replace(/[^0-9]/g, ''))
          : typeof bookNode.numberOfPages === 'number'
            ? bookNode.numberOfPages
            : undefined

      return {
        title: cleanString(typeof bookNode.name === 'string' ? bookNode.name : undefined),
        authors: cleanAuthors(authors),
        summary: cleanString(typeof bookNode.description === 'string' ? stripTags(bookNode.description) : undefined),
        isbn: cleanString(typeof bookNode.isbn === 'string' ? bookNode.isbn : undefined),
        language: cleanString(typeof bookNode.inLanguage === 'string' ? bookNode.inLanguage : undefined),
        cover: cleanString(typeof bookNode.image === 'string' ? bookNode.image : undefined),
        publishedDate: cleanString(typeof bookNode.datePublished === 'string' ? bookNode.datePublished : undefined),
        pageCount: cleanPageCount(pageCandidate),
      }
    } catch {
      continue
    }
  }

  return {}
}

function parseLabeledField(html: string, label: string): string | undefined {
  const patterns = [
    new RegExp(`<div[^>]*>\\s*${label}\\s*</div>\\s*<div[^>]*>([\\s\\S]*?)</div>`, 'i'),
    new RegExp(`${label}[\\s\\S]{0,120}?<span[^>]*>([\\s\\S]*?)</span>`, 'i'),
    new RegExp(`${label}\\s*:?\\s*([A-Za-z0-9, \-/]+)`, 'i'),
  ]

  for (const pattern of patterns) {
    const value = cleanString(stripTags(html.match(pattern)?.[1] ?? ''))
    if (value) return value
  }

  return undefined
}

function parseGoodreadsBookPage(html: string): Partial<EnglishBook> {
  const jsonLd = parseJsonLdBook(html)

  const titleFromHeading = cleanString(stripTags(html.match(/<h1[^>]*data-testid="bookTitle"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? ''))
  const seriesFromHeading = cleanString(stripTags(html.match(/<h3[^>]*data-testid="bookSeries"[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? ''))

  const isbn = parseLabeledField(html, 'ISBN')
  const isbn13 = parseLabeledField(html, 'ISBN13')
  const language = parseLabeledField(html, 'Language')
  const publisher = parseLabeledField(html, 'Publisher')
  const publishedDate = parseLabeledField(html, 'Published') ?? parseLabeledField(html, 'Publication date')

  const pageCountMatch = html.match(/(\d{1,5})\s*pages?/i)
  const pageCount = pageCountMatch ? Number(pageCountMatch[1]) : undefined

  const genreMatches = Array.from(html.matchAll(/href="\/genres\/[^"#?]+"[^>]*>([^<]+)</gi)).map((m) => stripTags(m[1]))
  const genres = Array.from(new Set(genreMatches.map((g) => g.trim()).filter(Boolean))).slice(0, 10)

  const workIdMatch = html.match(/"workId":\s*(\d+)/i) ?? html.match(/data-work-id="(\d+)"/i)

  const authorsFromHtml = Array.from(
    html.matchAll(/<a[^>]*class="[^"]*ContributorLink[^"]*"[^>]*>([\s\S]*?)<\/a>/gi),
  ).map((m) => stripTags(m[1]))

  return {
    title: titleFromHeading ?? jsonLd.title,
    series: seriesFromHeading,
    authors: cleanAuthors(authorsFromHtml.length ? authorsFromHtml : jsonLd.authors),
    summary: jsonLd.summary,
    genres,
    isbn: isbn ?? jsonLd.isbn,
    isbn13,
    language: language ?? jsonLd.language,
    cover: jsonLd.cover,
    publisher,
    publishedDate: publishedDate ?? jsonLd.publishedDate,
    pageCount: cleanPageCount(pageCount ?? jsonLd.pageCount),
    sourceRefs: {
      goodreadsWorkId: workIdMatch?.[1],
    },
  }
}

export async function searchGoodreadsBooks(query: string, limit = 20): Promise<EnglishBook[]> {
  const url = new URL(GOODREADS_SEARCH_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('search_type', 'books')

  const searchResponse = await fetch(url.toString(), {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.8,he;q=0.6',
    },
    cache: 'no-store',
  })

  if (!searchResponse.ok) {
    console.error('goodreads search failed with status:', searchResponse.status, 'query:', query)
    return []
  }

  const searchHtml = await searchResponse.text()
  const rows = getBookRows(searchHtml)
  const baseResults = rows
    .map((row) => parseSearchRow(row))
    .filter((candidate): candidate is Partial<EnglishBook> => Boolean(candidate?.title))
    .slice(0, limit)

  const detailedResults: EnglishBook[] = []

  for (const base of baseResults) {
    const goodreadsBookId = base.sourceRefs?.goodreadsBookId
    if (!goodreadsBookId) {
      detailedResults.push({
        title: base.title ?? '',
        series: base.series,
        authors: cleanAuthors(base.authors),
        summary: undefined,
        genres: [],
        isbn: undefined,
        isbn13: undefined,
        language: base.language,
        cover: base.cover,
        publisher: undefined,
        publishedDate: undefined,
        pageCount: undefined,
        sourceEditionId: base.sourceEditionId,
        sourceRefs: base.sourceRefs,
        sourceTrace: ['goodreads-search'],
      })
      continue
    }

    try {
      const detailUrl = `${GOODREADS_HOST}/book/show/${goodreadsBookId}`
      const detailResponse = await fetch(detailUrl, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.8,he;q=0.6',
        },
        cache: 'no-store',
      })

      if (!detailResponse.ok) {
        console.error('goodreads detail failed with status:', detailResponse.status, 'bookId:', goodreadsBookId)
        detailedResults.push({
          title: base.title ?? '',
          series: base.series,
          authors: cleanAuthors(base.authors),
          summary: undefined,
          genres: [],
          isbn: undefined,
          isbn13: undefined,
          language: base.language,
          cover: base.cover,
          publisher: undefined,
          publishedDate: undefined,
          pageCount: undefined,
          sourceEditionId: base.sourceEditionId,
          sourceRefs: base.sourceRefs,
          sourceTrace: ['goodreads-search', 'goodreads-detail-failed'],
        })
        continue
      }

      const detailHtml = await detailResponse.text()
      const details = parseGoodreadsBookPage(detailHtml)

      detailedResults.push({
        title: cleanString(details.title) ?? base.title ?? '',
        series: cleanString(details.series) ?? cleanString(base.series),
        authors: cleanAuthors(details.authors?.length ? details.authors : base.authors),
        summary: cleanString(details.summary),
        genres: Array.isArray(details.genres) ? details.genres : [],
        isbn: cleanString(details.isbn),
        isbn13: cleanString(details.isbn13),
        language: cleanString(details.language) ?? cleanString(base.language),
        cover: cleanString(details.cover) ?? cleanString(base.cover),
        publisher: cleanString(details.publisher),
        publishedDate: cleanString(details.publishedDate),
        pageCount: cleanPageCount(details.pageCount),
        sourceEditionId: base.sourceEditionId,
        sourceRefs: {
          ...base.sourceRefs,
          ...details.sourceRefs,
        },
        sourceTrace: ['goodreads-search', 'goodreads-detail'],
      })
    } catch (error) {
      console.error('goodreads detail fetch error:', {
        bookId: goodreadsBookId,
        error,
      })

      detailedResults.push({
        title: base.title ?? '',
        series: base.series,
        authors: cleanAuthors(base.authors),
        summary: undefined,
        genres: [],
        isbn: undefined,
        isbn13: undefined,
        language: base.language,
        cover: base.cover,
        publisher: undefined,
        publishedDate: undefined,
        pageCount: undefined,
        sourceEditionId: base.sourceEditionId,
        sourceRefs: base.sourceRefs,
        sourceTrace: ['goodreads-search', 'goodreads-detail-error'],
      })
    }
  }

  return detailedResults
}
