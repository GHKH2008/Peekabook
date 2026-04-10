import type { EnglishBook, EnglishBookCandidate, EnglishBookFormat } from '../types'
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

function cleanPageCount(value?: number | null): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value <= 0) return undefined
  return Math.floor(value)
}

function inferFormat(label?: string): EnglishBookFormat {
  const value = (label || '').trim().toLowerCase()
  if (!value) return 'unknown'
  if (value.includes('paperback')) return 'paperback'
  if (value.includes('hardcover')) return 'hardcover'
  if (value.includes('kindle')) return 'kindle'
  if (value.includes('audiobook')) return 'audiobook'
  if (value.includes('audio cd')) return 'audio_cd'
  if (value.includes('mass market')) return 'mass_market_paperback'
  return 'unknown'
}

function normalizeTitle(rawTitle: string): { title: string; series?: string } {
  const cleaned = rawTitle.replace(/\s+/g, ' ').trim()

  const bookOfMatch = cleaned.match(/^(.*?)\s*\(([^,]+),\s*(\d+)\)\s*$/i)
  if (bookOfMatch) {
    return {
      title: bookOfMatch[1].trim(),
      series: bookOfMatch[2].trim(),
    }
  }

  const bareSeriesMatch = cleaned.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (bareSeriesMatch) {
    const left = bareSeriesMatch[1].trim()
    const right = bareSeriesMatch[2].trim()
    if (/series|book|volume|vol\./i.test(right) || /^[A-Z][A-Za-z0-9' -]+$/.test(right)) {
      return {
        title: left,
        series: right,
      }
    }
  }

  return { title: cleaned }
}

function parseProductDetails(html: string): Partial<EnglishBook> {
  const text = html.replace(/\r/g, '')
  const getValue = (label: string): string | undefined => {
    const pattern = new RegExp(`${label}\\s*[:：]\\s*</span>\\s*([^<]+)`, 'i')
    const match = text.match(pattern)
    return cleanString(stripTags(match?.[1] || ''))
  }

  const publisherLineMatch = text.match(/Publisher[\s\S]{0,200}?<\/span>\s*([^<]+)/i)
  let publisher: string | undefined
  let publishedDate: string | undefined

  if (publisherLineMatch?.[1]) {
    const line = stripTags(publisherLineMatch[1])
    const parts = line.split(';').map((part) => part.trim()).filter(Boolean)
    publisher = cleanString(parts[0])
    if (parts.length > 1) {
      publishedDate = cleanString(parts[parts.length - 1])
    }
  }

  const explicitPublishedDate = getValue('Publication date')
  const language = getValue('Language')
  const isbn10 = getValue('ISBN-10')
  const isbn13 = getValue('ISBN-13')
  const narrator = getValue('Narrator')
  const printLengthLine = getValue('Print length')
  const listeningLengthLine = getValue('Listening Length')
  const bookOfLine = getValue('Book 1 of') || getValue('Book')

  let pageCount: number | undefined
  const printLengthMatch = printLengthLine?.match(/(\d+)/)
  if (printLengthMatch) {
    pageCount = cleanPageCount(Number(printLengthMatch[1]))
  }

  let series: string | undefined
  if (bookOfLine) {
    const cleaned = cleanString(bookOfLine)
    if (cleaned) series = cleaned
  }

  return {
    publisher,
    publishedDate: explicitPublishedDate || publishedDate,
    language,
    isbn: isbn10,
    isbn13,
    pageCount,
    narrator: cleanString(narrator),
    series,
    edition: cleanString(listeningLengthLine),
  }
}

export async function searchAmazonEnglishCandidates(query: string, limit = 20): Promise<EnglishBookCandidate[]> {
  const url = new URL(AMAZON_SEARCH_URL)
  url.searchParams.set('k', query)
  url.searchParams.set('i', 'stripbooks')
  url.searchParams.set('s', 'relevanceexprank')

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
  const itemRegex = /<div[^>]+data-asin="([A-Z0-9]{10})"[\s\S]*?<\/div>\s*<\/div>/g

  const candidates: EnglishBookCandidate[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(html)) !== null && candidates.length < limit) {
    const asin = match[1]
    if (!asin || seen.has(asin)) continue

    const block = match[0]
    if (/Sponsored|sponsored/i.test(block)) continue

    const titleMatch =
      block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i) ||
      block.match(/aria-label="([^"]+)"/i)

    const rawTitle = stripTags(titleMatch?.[1] || '')
    if (!rawTitle) continue

    const titleMeta = normalizeTitle(rawTitle)

    const authorMatches = Array.from(
      block.matchAll(/class="a-size-base(?:\+)?[^"]*"[^>]*>([^<]+)<\/a>/g)
    ).map((m) => stripTags(m[1]))
    const authors = cleanAuthors(authorMatches).slice(0, 3)

    const coverMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*class="s-image"/i)

    const formatMatch =
      block.match(/(?:Paperback|Hardcover|Kindle|Audiobook|Audio CD|Mass Market Paperback)/i)
    const formatLabel = cleanString(formatMatch?.[0])

    const key = `${asin}:${formatLabel || 'unknown'}:${titleMeta.title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    candidates.push({
      title: titleMeta.title,
      authors,
      cover: coverMatch?.[1],
      language: 'en',
      format: inferFormat(formatLabel),
      formatLabel,
      sourceEditionId: `amazon:${asin}`,
      sourceRefs: {
        amazonAsin: asin,
      },
    })
  }

  return candidates
}

export async function enrichAmazonEdition(candidate: EnglishBook): Promise<Partial<EnglishBook>> {
  const asin = candidate.sourceRefs?.amazonAsin
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

  const html = await response.text()
  const parsed = parseProductDetails(html)

  const titleMeta = normalizeTitle(candidate.title)

  return {
    title: titleMeta.title,
    series: cleanString(candidate.series) || parsed.series || titleMeta.series,
    authors: candidate.authors,
    summary: undefined,
    genres: [],
    isbn: parsed.isbn,
    isbn13: parsed.isbn13,
    language: parsed.language || candidate.language,
    cover: candidate.cover,
    publisher: parsed.publisher,
    publishedDate: parsed.publishedDate,
    pageCount: parsed.pageCount,
    format: candidate.format,
    formatLabel: candidate.formatLabel,
    narrator: parsed.narrator,
    edition: parsed.edition,
    sourceEditionId: candidate.sourceEditionId,
    sourceRefs: candidate.sourceRefs,
    sourceTrace: ['amazon'],
  }
}
