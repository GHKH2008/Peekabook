import { googleProvider } from './google'
import { openLibraryProvider } from './openlibrary'
import { createHtmlMetadataProvider } from './html-provider'
import type { BookSearchProvider } from './interface'

export const steimatzkyProvider = createHtmlMetadataProvider({
  name: 'steimatzky',
  allowEnv: 'BOOK_PROVIDER_STEIMATZKY_ENABLED',
  searchUrl: (query) => `https://www.steimatzky.co.il/search?query=${encodeURIComponent(query)}`,
})

export const booknetProvider = createHtmlMetadataProvider({
  name: 'booknet',
  allowEnv: 'BOOK_PROVIDER_BOOKNET_ENABLED',
  searchUrl: (query) => `https://www.booknet.co.il/catalogsearch/result/?q=${encodeURIComponent(query)}`,
})

export const indiebookProvider = createHtmlMetadataProvider({
  name: 'indiebook',
  allowEnv: 'BOOK_PROVIDER_INDIEBOOK_ENABLED',
  searchUrl: (query) => `https://indiebook.co.il/shop/?s=${encodeURIComponent(query)}`,
})

export const simaniaProvider = createHtmlMetadataProvider({
  name: 'simania',
  allowEnv: 'BOOK_PROVIDER_SIMANIA_ENABLED',
  searchUrl: (query) => `https://simania.co.il/search.php?search[title]=${encodeURIComponent(query)}`,
})

export function getBookProviders(): Array<{ provider: BookSearchProvider; order: number }> {
  return [
    { provider: googleProvider, order: 90 },
    { provider: openLibraryProvider, order: 80 },
    { provider: steimatzkyProvider, order: 70 },
    { provider: booknetProvider, order: 60 },
    { provider: indiebookProvider, order: 50 },
    { provider: simaniaProvider, order: 40 },
  ]
}
