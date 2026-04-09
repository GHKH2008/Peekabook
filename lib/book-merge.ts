import type { BookSourceName, GoogleBook } from '@/lib/google-books'

const HEBREW_RE = /[\u0590-\u05FF]/
const NIKKUD_RE = /[\u0591-\u05C7]/g
const HEBREW_PUNCT_RE = /[\u05BE\u05C0\u05C3\u05F3\u05F4]/g

export type SourceReference = {
  source: BookSourceName
  sourceId?: string
  link?: string
}

export type MergeDebugInfo = {
  mergedIds: string[]
  reasons: string[]
  confidence: number
}

function hasHebrewText(value: string | null | undefined): boolean {
  return HEBREW_RE.test(String(value || ''))
}

export function normalizeBookText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[’‘‚‛`´]/g, "'")
    .replace(HEBREW_PUNCT_RE, ' ')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[\]\[(){}|\\/.,;:!?]+/g, ' ')
    .replace(/[^\p{L}\p{N}'"-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeHebrewForComparison(value: string | null | undefined): string {
  return normalizeBookText(value)
    .replace(NIKKUD_RE, '')
    .replace(/["']/g, '')
    .replace(/\bו-/g, 'ו')
    .replace(/-/g, ' ')
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeBookIdentifier(value: string | null | undefined): string {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
}

export function normalizeBookLanguage(value: string | null | undefined): string | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized.startsWith('he') || normalized === 'heb') return 'he'
  if (normalized.startsWith('en') || normalized === 'eng') return 'en'
  return normalized
}

function extractYear(value: string | undefined): number | undefined {
  if (!value) return undefined
  const match = value.match(/(1[6-9]\d{2}|20\d{2}|2100)/)
  return match ? Number(match[1]) : undefined
}

function getPrimaryAuthor(book: GoogleBook): string {
  return book.volumeInfo.authors?.[0] || ''
}

function getIsbnSet(book: GoogleBook): Set<string> {
  return new Set(
    (book.volumeInfo.industryIdentifiers || [])
      .map((item) => normalizeBookIdentifier(item.identifier))
      .filter(Boolean)
  )
}

function shareIsbn(a: GoogleBook, b: GoogleBook): boolean {
  const aIsbns = getIsbnSet(a)
  if (aIsbns.size === 0) return false

  for (const isbn of getIsbnSet(b)) {
    if (aIsbns.has(isbn)) return true
  }

  return false
}

function collectSourceRefs(book: GoogleBook): SourceReference[] {
  const entries = Object.entries(book.sourceDetails?.sources || {})
  const refs: SourceReference[] = entries
    .map(([source, details]) => ({
      source: source as BookSourceName,
      sourceId: details?.id,
      link: details?.link,
    }))
    .filter((value) => Boolean(value.source))

  if (refs.length > 0) return refs

  if (book.source) {
    return [
      {
        source: book.source,
        sourceId: book.id,
      },
    ]
  }

  return []
}

function titleSimilarity(a: GoogleBook, b: GoogleBook): number {
  const aOriginal = normalizeBookText(a.volumeInfo.title)
  const bOriginal = normalizeBookText(b.volumeInfo.title)
  const aHebrew = normalizeHebrewForComparison(a.volumeInfo.title)
  const bHebrew = normalizeHebrewForComparison(b.volumeInfo.title)

  if (!aOriginal || !bOriginal) return 0
  if (aOriginal === bOriginal || aHebrew === bHebrew) return 1

  if (aOriginal.includes(bOriginal) || bOriginal.includes(aOriginal)) return 0.82
  if (aHebrew && bHebrew && (aHebrew.includes(bHebrew) || bHebrew.includes(aHebrew))) return 0.8

  const aTokens = new Set(aHebrew.split(' ').filter((token) => token.length > 1))
  const bTokens = new Set(bHebrew.split(' ').filter((token) => token.length > 1))
  if (aTokens.size === 0 || bTokens.size === 0) return 0

  let overlap = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1
  }

  return overlap / Math.max(aTokens.size, bTokens.size)
}

function authorSimilarity(a: GoogleBook, b: GoogleBook): number {
  const aAuthor = normalizeHebrewForComparison(getPrimaryAuthor(a))
  const bAuthor = normalizeHebrewForComparison(getPrimaryAuthor(b))
  if (!aAuthor || !bAuthor) return 0.25
  if (aAuthor === bAuthor) return 1
  if (aAuthor.includes(bAuthor) || bAuthor.includes(aAuthor)) return 0.75
  return 0
}

function languageSimilarity(a: GoogleBook, b: GoogleBook): number {
  const aLang = normalizeBookLanguage(a.volumeInfo.language)
  const bLang = normalizeBookLanguage(b.volumeInfo.language)
  if (!aLang || !bLang) return 0.2
  return aLang === bLang ? 0.7 : -0.5
}

function yearSimilarity(a: GoogleBook, b: GoogleBook): number {
  const aYear = extractYear(a.volumeInfo.publishedDate)
  const bYear = extractYear(b.volumeInfo.publishedDate)
  if (!aYear || !bYear) return 0.1
  if (aYear === bYear) return 0.7
  if (Math.abs(aYear - bYear) <= 1) return 0.4
  if (Math.abs(aYear - bYear) <= 4) return 0.15
  return -0.35
}

function sourceIdentityBoost(a: GoogleBook, b: GoogleBook): number {
  const aRefs = collectSourceRefs(a)
  const bRefs = collectSourceRefs(b)

  for (const left of aRefs) {
    for (const right of bRefs) {
      if (left.source === right.source && left.sourceId && right.sourceId && left.sourceId === right.sourceId) {
        return 3
      }
    }
  }

  return 0
}

export function scoreBookMergeMatch(a: GoogleBook, b: GoogleBook): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  if (shareIsbn(a, b)) {
    score += 4
    reasons.push('shared_isbn')
  }

  const titleScore = titleSimilarity(a, b)
  score += titleScore * 3
  if (titleScore >= 0.8) reasons.push('title_match')

  const authorScore = authorSimilarity(a, b)
  score += authorScore * 2
  if (authorScore >= 0.75) reasons.push('author_match')

  const langScore = languageSimilarity(a, b)
  score += langScore
  if (langScore >= 0.7) reasons.push('language_match')

  const publishedYearScore = yearSimilarity(a, b)
  score += publishedYearScore
  if (publishedYearScore >= 0.4) reasons.push('year_close')

  const sourceBoost = sourceIdentityBoost(a, b)
  if (sourceBoost > 0) {
    score += sourceBoost
    reasons.push('source_id_match')
  }

  if (hasHebrewText(a.volumeInfo.title) !== hasHebrewText(b.volumeInfo.title) && !shareIsbn(a, b)) {
    score -= 0.6
  }

  return {
    score,
    reasons,
  }
}

function chooseBestText(values: Array<string | undefined>): string | undefined {
  const ranked = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)

  return ranked[0]
}

function chooseBestTitle(values: Array<string | undefined>): string {
  const ranked = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort((left, right) => {
      const leftPenalty = /[:;|]\s*(book|volume|edition|part)\b/i.test(left) ? -1 : 0
      const rightPenalty = /[:;|]\s*(book|volume|edition|part)\b/i.test(right) ? -1 : 0
      if (leftPenalty !== rightPenalty) return rightPenalty - leftPenalty
      return right.length - left.length
    })

  return ranked[0] || 'Unknown title'
}

function chooseBestCover(books: GoogleBook[]): { thumbnail?: string; smallThumbnail?: string } | undefined {
  const withCover = books
    .map((book) => ({
      thumbnail: book.volumeInfo.imageLinks?.thumbnail,
      smallThumbnail: book.volumeInfo.imageLinks?.smallThumbnail,
      widthHint: (book.volumeInfo.imageLinks?.thumbnail || '').includes('zoom=') ? 1 : 0,
    }))
    .filter((item) => item.thumbnail || item.smallThumbnail)

  if (withCover.length === 0) return undefined

  withCover.sort((a, b) => {
    const aLen = (a.thumbnail || a.smallThumbnail || '').length + a.widthHint
    const bLen = (b.thumbnail || b.smallThumbnail || '').length + b.widthHint
    return bLen - aLen
  })

  return {
    thumbnail: withCover[0].thumbnail || withCover[0].smallThumbnail,
    smallThumbnail: withCover[0].smallThumbnail || withCover[0].thumbnail,
  }
}

function combineCategories(books: GoogleBook[]): string[] | undefined {
  const merged = new Set<string>()

  for (const book of books) {
    for (const category of book.volumeInfo.categories || []) {
      const normalized = normalizeBookText(category)
      if (!normalized) continue
      merged.add(category)
      if (merged.size >= 8) break
    }
  }

  return merged.size > 0 ? Array.from(merged) : undefined
}

function sourceList(books: GoogleBook[]): BookSourceName[] {
  const merged = new Set<BookSourceName>()

  for (const book of books) {
    if (book.source) merged.add(book.source)
    for (const source of book.sourceTrace || []) merged.add(source)
    for (const source of Object.keys(book.sourceDetails?.sources || {})) {
      merged.add(source as BookSourceName)
    }
  }

  return Array.from(merged)
}

function sourceDetails(books: GoogleBook[]): NonNullable<GoogleBook['sourceDetails']> {
  const sources: NonNullable<GoogleBook['sourceDetails']>['sources'] = {}

  for (const book of books) {
    const refs = collectSourceRefs(book)
    for (const ref of refs) {
      const current = sources[ref.source]
      sources[ref.source] = {
        id: ref.sourceId || current?.id,
        link: ref.link || current?.link,
      }
    }
  }

  return { sources }
}

function choosePreferredSource(sources: BookSourceName[]): BookSourceName | undefined {
  const order: BookSourceName[] = [
    'steimatzky',
    'booknet',
    'indiebook',
    'simania',
    'nli_catalog',
    'israel_books_catalog',
    'hebrewbooks_catalog',
    'openlibrary',
    'google',
    'wikidata',
    'wikipedia',
    'gutendex',
  ]

  for (const source of order) {
    if (sources.includes(source)) return source
  }

  return sources[0]
}

export function mergeBookCluster(books: GoogleBook[], debug?: MergeDebugInfo): GoogleBook {
  const sources = sourceList(books)
  const preferredSource = choosePreferredSource(sources)
  const bestCover = chooseBestCover(books)

  const merged: GoogleBook = {
    id: `merged:${books.map((book) => book.id).sort().join('|')}`,
    source: preferredSource,
    sourceTrace: sources,
    sourceDetails: {
      ...sourceDetails(books),
      debug,
    },
    volumeInfo: {
      title: chooseBestTitle(books.map((book) => book.volumeInfo.title)),
      authors:
        books
          .map((book) => book.volumeInfo.authors)
          .find((authors) => Array.isArray(authors) && authors.length > 0) || undefined,
      description: chooseBestText(books.map((book) => book.volumeInfo.description)),
      categories: combineCategories(books),
      industryIdentifiers: Array.from(
        new Map(
          books
            .flatMap((book) => book.volumeInfo.industryIdentifiers || [])
            .map((identifier) => {
              const normalized = normalizeBookIdentifier(identifier.identifier)
              return [`${identifier.type}:${normalized}`, { ...identifier, identifier: normalized }] as const
            })
            .filter(([, identifier]) => Boolean(identifier.identifier))
        ).values()
      ),
      language:
        books
          .map((book) => normalizeBookLanguage(book.volumeInfo.language))
          .find((language) => Boolean(language)) || undefined,
      imageLinks: bestCover,
      publisher:
        books
          .map((book) => book.volumeInfo.publisher)
          .find((publisher) => Boolean(publisher)) || undefined,
      publishedDate:
        books
          .map((book) => book.volumeInfo.publishedDate)
          .sort((left, right) => String(left || '').length - String(right || '').length)
          .find((value) => Boolean(value)) || undefined,
      pageCount:
        books
          .map((book) => book.volumeInfo.pageCount)
          .filter((pages): pages is number => typeof pages === 'number' && pages > 0)
          .sort((left, right) => right - left)[0],
      maturityRating:
        books
          .map((book) => book.volumeInfo.maturityRating)
          .find((value) => value === 'MATURE') ||
        books
          .map((book) => book.volumeInfo.maturityRating)
          .find((value) => Boolean(value)) ||
        'NOT_MATURE',
    },
  }

  return merged
}

export function mergeDuplicateBooks(books: GoogleBook[], enableDebug = false): GoogleBook[] {
  const clusters: GoogleBook[][] = []

  for (const candidate of books) {
    let bestClusterIndex = -1
    let bestScore = Number.NEGATIVE_INFINITY
    let bestReasons: string[] = []

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]
      const clusterLead = cluster[0]
      const { score, reasons } = scoreBookMergeMatch(clusterLead, candidate)

      if (score > bestScore) {
        bestScore = score
        bestClusterIndex = i
        bestReasons = reasons
      }
    }

    if (bestClusterIndex >= 0 && bestScore >= 3.25) {
      const cluster = clusters[bestClusterIndex]
      cluster.push(candidate)

      if (enableDebug) {
        const lead = cluster[0]
        console.info('[books-search] merged candidate', {
          into: lead.id,
          candidate: candidate.id,
          score: Number(bestScore.toFixed(2)),
          reasons: bestReasons,
        })
      }
    } else {
      clusters.push([candidate])
    }
  }

  const merged = clusters.map((cluster) => {
    const confidences: number[] = []
    const reasonSet = new Set<string>()

    for (let i = 1; i < cluster.length; i++) {
      const { score, reasons } = scoreBookMergeMatch(cluster[0], cluster[i])
      confidences.push(score)
      for (const reason of reasons) reasonSet.add(reason)
    }

    const debug: MergeDebugInfo | undefined =
      enableDebug && cluster.length > 1
        ? {
            mergedIds: cluster.map((book) => book.id),
            reasons: Array.from(reasonSet),
            confidence:
              confidences.length > 0
                ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(2))
                : 0,
          }
        : undefined

    return mergeBookCluster(cluster, debug)
  })

  if (enableDebug) {
    console.info('[books-search] merge summary', {
      rawResults: books.length,
      mergedResults: merged.length,
      mergedGroups: clusters.filter((cluster) => cluster.length > 1).map((cluster) => cluster.map((book) => book.id)),
    })
  }

  return merged
}

export function buildMergedDisplayModel(book: GoogleBook): {
  sourceSummary: string
  hasCover: boolean
} {
  const sources = book.sourceTrace || []

  return {
    sourceSummary: sources
      .map((source) => {
        if (source === 'openlibrary') return 'Open Library'
        if (source === 'wikidata') return 'Wikidata'
        if (source === 'steimatzky') return 'Steimatzky'
        if (source === 'booknet') return 'Booknet'
        if (source === 'indiebook') return 'Indiebook'
        if (source === 'simania') return 'Simania'
        if (source === 'nli_catalog') return 'NLI Catalog'
        if (source === 'hebrewbooks_catalog') return 'HebrewBooks'
        if (source === 'israel_books_catalog') return 'Israel Books'
        return source.charAt(0).toUpperCase() + source.slice(1)
      })
      .join(' • '),
    hasCover: Boolean(book.volumeInfo.imageLinks?.thumbnail || book.volumeInfo.imageLinks?.smallThumbnail),
  }
}
