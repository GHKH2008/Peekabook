import type { EnglishBook } from '../types'
import { cleanAuthors } from '../english-utils'

type EnglishBookCandidate = {
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

const AMAZON_SEARCH_URL = 'https://www.amazon.com/s'

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function cleanString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const lowered = trimmed.toLowerCase()
  if (lowered === 'unknown' || lowered === 'n/a' || lowered === 'not available') return undefined
  return trimmed
}

function cleanPageCount(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0) return undefined
  return Math.floor(value)
}

function normalizeTitle(rawTitle: string): { title: string; series?: string } {
  const cleaned = rawTitle.replace(/\s+/g, ' ').trim()

  const numberedSeriesMatch = cleaned.match(/^(.*?)\s*\(([^,]+),\s*(\d+)\)\s*$/i)
  if (numberedSeriesMatch) {
    return {
      title: numberedSeriesMatch[1].trim(),
      series: numberedSeriesMatch[2].trim(),
    }
  }

  return { title: cleaned }
}

function looksRelevantToQuery(query: string, title: string, authors: string[]): boolean {
  const q = query.trim().toLowerCase()
  const t = title.toLowerCase()
  const authorText = authors.join(' ').toLowerCase()

  if (t === q) return true
  if (t.includes(q)) return true

  const qTokens = q.split(/\s+/).filter(Boolean)
  if (qTokens.length === 0) return false

  const allTokensInTitle = qTokens.every((token) => t.includes(token))
  if (allTokensInTitle) return true

  return qTokens.every((token) => t.includes(token) || authorText.includes(token))
}

function getSearchBlocks(html: string): string[] {
  const matches = html.match(/<div[^>]+data-component-type="s-search-result"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi)
  return matches || []
}

export async function searchAmazonEnglishCandidates(query: string, limit = 20): Promise<EnglishBookCandidate[]> {
  const url = new URL(AMAZON_SEARCH_URL)
  url.searchParams.set('k', query)
  url.searchParams.set('i', 'stripbooks')

  const response = await fetch(url.toString(), {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.8',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    console.error('amazon search failed with status:', response.status)
    return []
  }

  const html = await response.text()
  const blocks = getSearchBlocks(html)

  const results: EnglishBookCandidate[] = []
  const seen = new Set<string>()

  for (const block of blocks) {
    if (results.length >= limit) break
    if (/Sponsored/i.test(block)) continue

    const asinMatch = block.match(/data-asin="([A-Z0-9]{10})"/i)
    const asin = asinMatch?.[1]
    if (!asin) continue

    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i)
    const rawTitle = stripTags(titleMatch?.[1] || '')
    if (!rawTitle) continue

    const titleMeta = normalizeTitle(rawTitle)

    const authorMatches = Array.from(
      block.matchAll(/<a[^>]*class="[^"]*a-size-base[^"]*"[^>]*>([^<]+)<\/a>/gi)
    ).map((m) => stripTags(m[1]))

    const authors = cleanAuthors(authorMatches).slice(0, 4)

    if (!looksRelevantToQuery(query, titleMeta.title, authors)) continue

    const coverMatch = block.match(/<img[^>]+class="s-image"[^>]+src="([^"]+)"/i)

    const key = `${asin}|${titleMeta.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    results.push({
      title: titleMeta.title,
      series: titleMeta.series,
      authors,
      cover: coverMatch?.[1],
      language: 'en',
      sourceEditionId: `amazon:${asin}`,
      sourceRefs: {
        amazonAsin: asin,
      },
    })
  }

  return results
}

function parseProductDetails(html: string): Partial<EnglishBook> {
  const text = html.replace(/\r/g, '')

  const getField = (label: string): string | undefined => {
    const patterns = [
      new RegExp(`${label}[\\s\\S]{0,140}?<span[^>]*>([^<]+)</span>`, 'i'),
      new RegExp(`${label}[\\s\\S]{0,140}?:\\s*([^<\\n]+)`, 'i'),
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      const value = cleanString(stripTags(match?.[1] || ''))
      if (value) return value
    }

    return undefined
  }

  const publisherLine = getField('Publisher')
  const publicationDate = getField('Publication date')
  const language = getField('Language')
  const isbn10 = getField('ISBN-10')
  const isbn13 = getField('ISBN-13')
  const printLength = getField('Print length')
  const bookOf = getField('Book 1 of') || getField('Book')

  let publisher: string | undefined
  let publishedDate: string | undefined

  if (publisherLine) {
    const parts = publisherLine.split(';').map((part) => part.trim()).filter(Boolean)
    publisher = cleanString(parts[0])
    if (parts.length > 1) {
      publishedDate = cleanString(parts[parts.length - 1])
    }
  }

  const pageMatch = printLength?.match(/(\d+)/)
  const pageCount = pageMatch ? Number(pageMatch[1]) : undefined

  return {
    publisher,
    publishedDate: publicationDate || publishedDate,
    language,
    isbn: isbn10,
    isbn13,
    pageCount: cleanPageCount(pageCount),
    series: bookOf,
  }
}

export async function enrichAmazonCandidate(book: EnglishBook): Promise<Partial<EnglishBook>> {
  const asin = book.sourceRefs?.amazonAsin
  if (!asin) return {}

  const url = `https://www.amazon.com/dp/${asin}`
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.8',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    console.error('amazon detail failed with status:', response.status, 'asin:', asin)
    return {}
  }

  return parseProductDetails(await response.text())
}
