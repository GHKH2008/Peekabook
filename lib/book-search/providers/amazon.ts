import type { EnglishBookEdition, EnglishBookFormat } from '../types'
import { cleanAuthors } from '../english-utils'

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

function inferFormat(label?: string): EnglishBookFormat {
  const value = (label || '').trim().toLowerCase()
  if (!value) return 'unknown'
  if (value.includes('paperback')) return 'paperback'
  if (value.includes('hardcover')) return 'hardcover'
  if (value.includes('mass market')) return 'mass_market_paperback'
  if (value.includes('audio cd')) return 'audio_cd'
  if (value.includes('audiobook')) return 'audiobook'
  if (value.includes('kindle')) return 'kindle'
  if (value.includes('ebook')) return 'ebook'
  return 'unknown'
}

function isPhysicalLoanableFormat(format: EnglishBookFormat): boolean {
  return (
    format === 'paperback' ||
    format === 'hardcover' ||
    format === 'mass_market_paperback' ||
    format === 'audio_cd'
  )
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

function getSearchBlocks(html: string): string[] {
  const matches = html.match(/<div[^>]+data-component-type="s-search-result"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi)
  return matches || []
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

function extractCardEdition(block: string): EnglishBookEdition | null {
  const asinMatch = block.match(/data-asin="([A-Z0-9]{10})"/i)
  const asin = asinMatch?.[1]
  if (!asin) return null

  if (/Sponsored/i.test(block)) return null

  const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i)
  const rawTitle = stripTags(titleMatch?.[1] || '')
  if (!rawTitle) return null

  const titleMeta = normalizeTitle(rawTitle)

  const authorMatches = Array.from(
    block.matchAll(/<a[^>]*class="[^"]*a-size-base[^"]*"[^>]*>([^<]+)<\/a>/gi)
  ).map((m) => stripTags(m[1]))

  const authors = cleanAuthors(authorMatches).slice(0, 4)
  const coverMatch = block.match(/<img[^>]+class="s-image"[^>]+src="([^"]+)"/i)
  const blockText = stripTags(block)

  const formatMatch = blockText.match(/Paperback|Hardcover|Mass Market Paperback|Audio CD|Audiobook|Kindle/i)
  const formatLabel = cleanString(formatMatch?.[0])
  const format = inferFormat(formatLabel)

  return {
    title: titleMeta.title,
    series: titleMeta.series,
    authors,
    genres: [],
    cover: coverMatch?.[1],
    language: 'en',
    format,
    formatLabel,
    sourceEditionId: `amazon:${asin}`,
    sourceRefs: {
      amazonAsin: asin,
    },
    sourceTrace: ['amazon-search'],
  }
}

function parseProductDetails(html: string): Partial<EnglishBookEdition> {
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
  const narrator = getField('Narrator')
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
    pageCount: typeof pageCount === 'number' && pageCount > 0 ? pageCount : undefined,
    narrator,
    series: bookOf,
  }
}

export async function searchAmazonEnglishEditions(query: string, limit = 16): Promise<EnglishBookEdition[]> {
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

  if (!response.ok) return []

  const html = await response.text()
  const blocks = getSearchBlocks(html)

  const results: EnglishBookEdition[] = []
  const seen = new Set<string>()

  for (const block of blocks) {
    if (results.length >= limit) break

    const edition = extractCardEdition(block)
    if (!edition) continue
    if (!looksRelevantToQuery(query, edition.title, edition.authors)) continue
    if (!isPhysicalLoanableFormat(edition.format || 'unknown')) continue

    const key = [
      edition.title.toLowerCase(),
      (edition.formatLabel || edition.format || 'unknown').toLowerCase(),
      edition.sourceRefs?.amazonAsin || '',
    ].join('|')

    if (seen.has(key)) continue
    seen.add(key)
    results.push(edition)
  }

  return results
}

export async function enrichAmazonEdition(edition: EnglishBookEdition): Promise<Partial<EnglishBookEdition>> {
  const asin = edition.sourceRefs?.amazonAsin
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

  if (!response.ok) return {}

  const parsed = parseProductDetails(await response.text())

  return {
    publisher: parsed.publisher,
    publishedDate: parsed.publishedDate,
    language: parsed.language,
    isbn: parsed.isbn,
    isbn13: parsed.isbn13,
    pageCount: parsed.pageCount,
    narrator: parsed.narrator,
    series: edition.series || parsed.series,
  }
}
