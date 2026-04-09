import type { BookSearchProvider } from './interface'
import { fetchHtml, readMetaContent, withAttribution } from './utils'
import type { BookProviderName, NormalizedBookResult, ProviderSearchOptions } from '../types'

type HtmlProviderConfig = {
  name: BookProviderName
  searchUrl: (query: string) => string
  allowEnv: string
}

export function createHtmlMetadataProvider(config: HtmlProviderConfig): BookSearchProvider {
  return {
    name: config.name,
    enabled: () => process.env[config.allowEnv] === 'true',
    async search(query: string, options?: ProviderSearchOptions): Promise<NormalizedBookResult[]> {
      if (!this.enabled()) return []
      const url = config.searchUrl(query)
      const html = await fetchHtml(url, options?.timeoutMs)
      if (!html) return []

      const title = readMetaContent(html, 'og:title') || readMetaContent(html, 'twitter:title')
      if (!title) return []

      const description = readMetaContent(html, 'og:description')
      const cover = readMetaContent(html, 'og:image')
      const canonical = readMetaContent(html, 'og:url') || url
      const priceRaw = html.match(/(?:₪|NIS)\s?([0-9]+(?:\.[0-9]{1,2})?)/i)?.[1]
      const price = priceRaw ? Number(priceRaw) : undefined

      return [
        withAttribution(
          {
            source: config.name,
            source_id: canonical,
            title,
            authors: [],
            description,
            language: /[\u0590-\u05FF]/.test(title) ? 'he' : undefined,
            cover_image: cover,
            thumbnail_image: cover,
            price,
            currency: price ? 'ILS' : undefined,
            canonical_url: canonical,
            raw_source_data: { url, htmlSnippet: html.slice(0, 1200) },
          },
          ['title', 'description', 'cover_image', 'price']
        ),
      ]
    },
    async lookupByExternalId(id: string) {
      if (!this.enabled()) return null
      const html = await fetchHtml(id)
      if (!html) return null
      const title = readMetaContent(html, 'og:title')
      if (!title) return null
      return {
        source: config.name,
        source_id: id,
        title,
        authors: [],
        canonical_url: id,
        raw_source_data: { htmlSnippet: html.slice(0, 1200) },
        source_attribution: [{ source: config.name, source_id: id, source_url: id, fields: ['title'] }],
      }
    },
  }
}
