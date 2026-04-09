import type { BookSearchProvider } from './interface'
import { fetchHtml, makeCandidate } from './utils'
import type { BookCandidate, ProviderSearchOptions } from '../types'

const AMAZON_BASE = 'https://www.amazon.com'

function isEnglishLanguage(language?: string): boolean {
  if (!language) return true
  const normalized = language.toLowerCase()
  return normalized.startsWith('en') || normalized === 'unknown'
}

function toAmazonSearchLink(query: string): string {
  return `${AMAZON_BASE}/s?k=${encodeURIComponent(query)}&i=stripbooks`
}

function toAmazonBookLink(asin: string): string {
  return `${AMAZON_BASE}/dp/${asin}`
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function sanitizeTitle(title: string): string {
  return decodeHtml(title)
    .replace(/\s*:\s*Amazon\.com.*$/i, '')
    .replace(/\s*\(.*?\)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAuthors(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(/,|\band\b/i)
    .map((name) => decodeHtml(name).replace(/^by\s+/i, '').trim())
    .filter((name) => name.length > 1)
    .filter((name) => !/(illustrator|editor|translator|introduction|foreword|contributor|artist)/i.test(name))
}

function findRegex(text: string, regex: RegExp): string | undefined {
  const match = text.match(regex)
  return match?.[1] ? decodeHtml(match[1]) : undefined
}

function parseSearchResults(html: string, limit: number): BookCandidate[] {
  const blocks = html.match(/<div\s+data-asin="[A-Z0-9]{10}"[\s\S]*?<\/div>\s*<\/div>/gi) || []
  const results: BookCandidate[] = []

  for (const block of blocks) {
    const asin = findRegex(block, /data-asin="([A-Z0-9]{10})"/i)
    const title = findRegex(block, /<h2[^>]*>\s*<a[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i)
    if (!asin || !title) continue

    const author = findRegex(block, /<div[^>]*class="[^"]*a-color-secondary[^"]*"[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i)
    const publishDate = findRegex(block, /(Published|publication date)\s*[:]?\s*<span[^>]*>([^<]+)<\/span>/i)
    const image = findRegex(block, /<img[^>]+src="([^"]+)"/i)

    const cleanTitle = sanitizeTitle(title)
    if (!cleanTitle) continue

    results.push(
      makeCandidate({
        source: 'amazon',
        sourceId: asin,
        sourceEditionId: asin,
        sourceUrl: toAmazonBookLink(asin),
        title: cleanTitle,
        authors: parseAuthors(author || ''),
        publishDate,
        coverUrl: image,
        languages: ['en'],
        tags: ['amazon', 'amazon_search'],
        raw: { asin, snippet: block.slice(0, 1200) },
      })
    )

    if (results.length >= limit) break
  }

  return results
}

export const amazonProvider: BookSearchProvider = {
  capabilities: { supportsIsbnSearch: true, supportsAuthorSearch: true, supportsLanguageFilter: true },
  name: 'amazon',
  enabled: () => process.env.BOOK_PROVIDER_AMAZON_ENABLED !== 'false',
  async search(query: string, language?: string, limit = 20, options?: ProviderSearchOptions): Promise<BookCandidate[]> {
    if (!this.enabled() || !isEnglishLanguage(language)) return []
    const normalizedQuery = String(query || '').trim()
    if (!normalizedQuery) return []

    const html = await fetchHtml(toAmazonSearchLink(normalizedQuery), options?.timeoutMs)
    if (!html) return []

    return parseSearchResults(html, Math.min(limit, 30))
  },
  async getWorkDetails(id: string, options?: ProviderSearchOptions) {
    return this.getEditionDetails(id, options)
  },
  async getEditionDetails(id: string, options?: ProviderSearchOptions) {
    const normalized = String(id || '').trim()
    if (!normalized) return null

    const isbn = normalized.replace(/[^0-9X]/gi, '').toUpperCase()
    if ((isbn.length === 10 || isbn.length === 13) && isEnglishLanguage(options?.language)) {
      return makeCandidate({
        source: 'amazon',
        sourceId: `isbn:${isbn}`,
        sourceEditionId: `isbn:${isbn}`,
        sourceUrl: toAmazonSearchLink(isbn),
        title: 'Amazon listing',
        isbn10: isbn.length === 10 ? [isbn] : [],
        isbn13: isbn.length === 13 ? [isbn] : [],
        format: 'retailer',
        languages: ['en'],
        tags: ['amazon'],
        raw: { isbn, type: 'amazon_enrichment' },
      })
    }

    const asin = normalized.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    if (asin.length !== 10 || !isEnglishLanguage(options?.language)) return null

    const html = await fetchHtml(toAmazonBookLink(asin), options?.timeoutMs)
    if (!html) return null

    const title = sanitizeTitle(findRegex(html, /<span\s+id="productTitle"[^>]*>([^<]+)<\/span>/i) || '')
    if (!title) return null

    const byLine = findRegex(html, /<span\s+class="author[^>]*">([\s\S]*?)<\/span>/i) || ''
    const authors = parseAuthors(byLine)
    const image = findRegex(html, /<img[^>]+id="landingImage"[^>]+src="([^"]+)"/i)
    const publisherLine = findRegex(html, /Publisher\s*:\s*([^<\n]+)/i)
    const publishDate = publisherLine?.match(/\(([^)]+)\)/)?.[1]

    return makeCandidate({
      source: 'amazon',
      sourceId: asin,
      sourceEditionId: asin,
      sourceUrl: toAmazonBookLink(asin),
      title,
      authors,
      publishers: publisherLine ? [publisherLine.replace(/\([^)]*\)/, '').trim()] : [],
      publishDate,
      coverUrl: image,
      languages: ['en'],
      tags: ['amazon', 'amazon_detail'],
      raw: { asin },
    })
  },
}
