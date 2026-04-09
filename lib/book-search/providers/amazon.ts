import type { EnglishBookCandidate } from '../types'
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

export async function searchAmazonEnglishCandidates(query: string, limit = 10): Promise<EnglishBookCandidate[]> {
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

  if (!response.ok) {
    return []
  }

  const html = await response.text()
  const itemRegex = /<div[^>]+data-asin="([A-Z0-9]{10})"[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<\/div>\s*<\/div>/g

  const candidates: EnglishBookCandidate[] = []
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(html)) !== null && candidates.length < limit) {
    const asin = match[1]
    const h2Chunk = match[2]

    const titleMatch = h2Chunk.match(/<span[^>]*>([\s\S]*?)<\/span>/)
    const rawTitle = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim()
    if (!rawTitle) continue

    const around = html.slice(Math.max(0, match.index - 800), Math.min(html.length, match.index + 1200))
    const authorMatches = Array.from(around.matchAll(/class="a-size-base\+?"[^>]*>([^<]+)<\/a>/g)).map((m) => decodeHtml(m[1]))

    const coverMatch = around.match(/<img[^>]+src="([^"]+)"[^>]*class="s-image"/)

    candidates.push({
      title: decodeHtml(rawTitle),
      authors: cleanAuthors(authorMatches).slice(0, 3),
      cover: coverMatch?.[1],
      language: 'en',
      sourceEditionId: `amazon:${asin}`,
      sourceRefs: {
        amazonAsin: asin,
      },
    })
  }

  return candidates
}
