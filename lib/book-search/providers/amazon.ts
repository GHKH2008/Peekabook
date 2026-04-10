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

  const numberedSeriesMatch = cleaned.match(/^(.*?)\s*\(([^,]+),\s*(\d+)\)\s*$/i)
  if (numberedSeriesMatch) {
    return {
      title: numberedSeriesMatch[1].trim(),
      series: numberedSeriesMatch[2].trim(),
    }
  }

  const cradleStyleMatch = cleaned.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (cradleStyleMatch) {
    const left = cradleStyleMatch[1].trim()
    const right = cradleStyleMatch[2].trim()
    if (
      /series|book|volume|vol\./i.test(right) ||
      /^[A-Z][A-Za-z0-9' -]+$/.test(right)
    ) {
      return {
        title: left,
        series: right,
      }
    }
  }

  return { title: cleaned }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

function scoreCandidate(query: string, title: string, authors: string[]): number {
  const queryTokens = tokenize(query)
  const haystack = `${title} ${authors.join(' ')}`.toLowerCase()

  let score = 0
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1
  }

  if (title.toLowerCase() === query.trim().toLowerCase()) score += 4
  if (title.toLowerCase().includes(query.trim().toLowerCase())) score += 2

  return score
}

function looksLikeBookishResult(blockText: string): boolean {
  return /paperback|hardcover|kindle|audiobook|audio cd|print length|isbn|publisher|publication date|narrator|will wight|author/i.test(
    blockText
  )
}

function looksLikeGarbageTitle(title: string): boolean {
  const value = title.trim().toLowerCase()
  if (!value) return true
  return (
    value === 'add to cart' ||
    value === 'shop now' ||
    value === 'visit the store' ||
    value.startsWith('create your own') ||
    value.includes('website')
  )
}

function parseSearchCards(html: string): Array<{ asin: string; block: string }> {
  const cards: Array<{ asin: string; block: string }> = []
  const regex = /<div[^>]+data-asin="([A-Z0-9]{10})"[^>]*data-component-type="s-search-result"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi

  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    cards.push({
      asin: match[1],
      block: match[0],
    })
  }

  return cards
}

function parseProductDetails(html: string): Partial<EnglishBook> {
  const text = html.replace(/\r/g, '')

  const publisherLineMatch = text.match(/Publisher[\s\S]{0,220}?<\/span>\s*([^<]+)/i)
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

  const publicationDateMatch = text.match(/Publication date[\s\S]{0,120}?<\/span>\s*([^<]+)/i)
  const languageMatch = text.match(/Language[\s\S]{0,120}?<\/span>\s*([^<]+)/i)
  const isbn10Match = text.match(/ISBN-10[\s\S]{0,120}?<\/span>\s*([^<]+)/i)
  const isbn13Match = text.match(/ISBN-13[\s\S]{0,120}?<\/span>\s*([^<]+)/i)
  const narratorMatch = text.match(/Narrator[\s\S]{0,120}?<\/span>\s*([^<]+)/i)
  const printLengthMatch = text.match(/Print length[\s\S]{0,120}?<\/span>\s*([^<]+)/i)
  const listeningLengthMatch = text.match(/Listening Length[\s\S]{0,120}?<\/span>\s*([^<]+)/i)
  const bookOfMatch = text.match(/Book\s+\d+\s+of\s+\d+[\s\S]{0,80}?<\/span>\s*([^<]+)/i)

  let pageCount: number | undefined
  const pageDigits = stripTags(printLengthMatch?.[1] || '').match(/(\d+)/)
  if (pageDigits) {
    pageCount = cleanPageCount(Number(pageDigits[1]))
  }

  let series: string | undefined
  if (bookOfMatch?.[1]) {
    series = cleanString(stripTags(bookOfMatch[1]))
  }

  return {
    publisher,
    publishedDate: cleanString(stripTags(publicationDateMatch?.[1] || '')) || publishedDate,
    language: cleanString(stripTags(languageMatch?.[1] || '')),
    isbn: cleanString(stripTags(isbn10Match?.[1] || '')),
    isbn13: cleanString(stripTags(isbn13Match?.[1] || '')),
    pageCount,
    narrator: cleanString(stripTags(narratorMatch?.[1] || '')),
    series,
    edition: cleanString(stripTags(listeningLengthMatch?.[1] || '')),
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
  const cards = parseSearchCards(html)
  const candidates: Array<EnglishBookCandidate & { _score: number }> = []
  const seen = new Set<string>()

  for (const { asin, block } of cards) {
    if (!asin) continue
    if (/sponsored/i.test(block)) continue

    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/h2>/i)
    const rawTitle = stripTags(titleMatch?.[1] || '')
    if (!rawTitle || looksLikeGarbageTitle(rawTitle)) continue

    const blockText = stripTags(block)
    if (!looksLikeBookishResult(blockText)) continue

    const titleMeta = normalizeTitle(rawTitle)

    const authorMatches = Array.from(
      block.matchAll(/class="a-size-base(?:\+)?[^"]*"[^>]*>([^<]+)<\/a>/g)
    ).map((m) => stripTags(m[1]))
    const authors = cleanAuthors(authorMatches).slice(0, 3)

    const coverMatch = block.match(/<img[^>]+class="s-image"[^>]+src="([^"]+)"/i)
    const formatMatch = blockText.match(/Paperback|Hardcover|Kindle|Audiobook|Audio CD|Mass Market Paperback/i)
    const formatLabel = cleanString(formatMatch?.[0])

    const score = scoreCandidate(query, titleMeta.title, authors)
    if (score <= 0) continue

    const dedupeKey = `${asin}:${formatLabel || 'unknown'}:${titleMeta.title.toLowerCase()}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    candidates.push({
      title: titleMeta.title,
      series: titleMeta.series,
      authors,
      cover: coverMatch?.[1],
      language: 'en',
      format: inferFormat(formatLabel),
      formatLabel,
      sourceEditionId: `amazon:${asin}`,
      sourceRefs: {
        amazonAsin: asin,
      },
      _score: score,
    })
  }

  return candidates
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...candidate }) => candidate)
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
