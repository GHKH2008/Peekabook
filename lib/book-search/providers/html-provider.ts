import type { BookSearchProvider } from './interface'
import { fetchHtml, makeCandidate, readMetaContent } from './utils'
import type { BookProviderName, BookCandidate, ProviderSearchOptions } from '../types'

type HtmlProviderConfig = {
  name: BookProviderName
  searchUrl: (query: string) => string
  allowEnv: string
}

export function createHtmlMetadataProvider(config: HtmlProviderConfig): BookSearchProvider {
  async function parseUrl(url: string, timeoutMs?: number): Promise<BookCandidate | null> {
    const html = await fetchHtml(url, timeoutMs)
    if (!html) return null
    const title = readMetaContent(html, 'og:title') || readMetaContent(html, 'twitter:title')
    if (!title) return null
    const description = readMetaContent(html, 'og:description')
    const cover = readMetaContent(html, 'og:image')
    const canonical = readMetaContent(html, 'og:url') || url

    return makeCandidate({
      source: config.name,
      sourceId: canonical,
      sourceEditionId: canonical,
      sourceUrl: canonical,
      title,
      authors: [],
      description,
      languages: /[\u0590-\u05FF]/.test(title) ? ['he'] : [],
      coverUrl: cover,
      raw: { url, htmlSnippet: html.slice(0, 1200) },
    })
  }

  return {
    name: config.name,
    enabled: () => process.env[config.allowEnv] === 'true',
    async search(query: string, _language?: string, _limit = 20, options?: ProviderSearchOptions): Promise<BookCandidate[]> {
      if (!this.enabled()) return []
      const candidate = await parseUrl(config.searchUrl(query), options?.timeoutMs)
      return candidate ? [candidate] : []
    },
    async getWorkDetails(id: string, options?: ProviderSearchOptions) {
      if (!this.enabled()) return null
      return await parseUrl(id, options?.timeoutMs)
    },
    async getEditionDetails(id: string, options?: ProviderSearchOptions) {
      if (!this.enabled()) return null
      return await parseUrl(id, options?.timeoutMs)
    },
  }
}
