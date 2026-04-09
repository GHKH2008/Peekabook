'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Search, BookOpen, Check, Plus, X } from 'lucide-react'
import Image from 'next/image'
import { searchBooks, addBookToLibrary, addCustomBookToLibrary } from '@/app/actions/books'
import type { GoogleBook } from '@/lib/google-books'

const HEBREW_RE = /[\u0590-\u05FF]/

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function normalizeIdentifier(value: string | null | undefined): string {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase()
}

function normalizeLanguage(value: string | null | undefined): string | undefined {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized.startsWith('he')) return 'he'
  if (normalized.startsWith('en')) return 'en'
  return normalized
}

function getBookIdentifier(book: GoogleBook, type: 'ISBN_13' | 'ISBN_10'): string | undefined {
  const identifier = book.volumeInfo.industryIdentifiers?.find((item) => item.type === type)
  const normalized = normalizeIdentifier(identifier?.identifier)
  return normalized || undefined
}

function getBookGroupKey(book: GoogleBook): string {
  const isbn13 = getBookIdentifier(book, 'ISBN_13')
  if (isbn13) return `isbn13:${isbn13}`

  const isbn10 = getBookIdentifier(book, 'ISBN_10')
  if (isbn10) return `isbn10:${isbn10}`

  const normalizedTitle = normalizeText(book.volumeInfo.title)
  const normalizedAuthor = normalizeText(book.volumeInfo.authors?.[0])
  return `title:${normalizedTitle}:author:${normalizedAuthor}`
}

function hasHebrewText(value: string | null | undefined): boolean {
  return HEBREW_RE.test(String(value || ''))
}

function isLanguageCompatible(preferred: string | undefined, candidate: string | undefined): boolean {
  if (!preferred || !candidate) return true
  return preferred === candidate
}

function shouldAcceptCover(merged: GoogleBook, candidate: GoogleBook): boolean {
  const cover = candidate.volumeInfo.imageLinks?.thumbnail || candidate.volumeInfo.imageLinks?.smallThumbnail
  if (!cover) return false

  const mergedText = `${merged.volumeInfo.title || ''} ${(merged.volumeInfo.authors || []).join(' ')}`
  const candidateText = `${candidate.volumeInfo.title || ''} ${(candidate.volumeInfo.authors || []).join(' ')}`
  const mergedHasHebrew = hasHebrewText(mergedText)
  const candidateHasHebrew = hasHebrewText(candidateText)
  if (mergedHasHebrew !== candidateHasHebrew) return false

  const mergedLanguage = normalizeLanguage(merged.volumeInfo.language)
  const candidateLanguage = normalizeLanguage(candidate.volumeInfo.language)
  if (!isLanguageCompatible(mergedLanguage, candidateLanguage)) return false

  return true
}

function pickBetterDescription(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!current) return candidate
  if (!candidate) return current
  return candidate.length > current.length ? candidate : current
}

function pickBetterPublishedDate(
  current: string | undefined,
  candidate: string | undefined
): string | undefined {
  if (!current) return candidate
  if (!candidate) return current
  return candidate.length > current.length ? candidate : current
}

function mergeBookGroup(books: GoogleBook[]): GoogleBook {
  const preferredSourceOrder: Array<GoogleBook['source']> = ['google', 'openlibrary', 'gutendex', 'wikipedia']
  const sorted = [...books].sort((a, b) => {
    const ai = preferredSourceOrder.indexOf(a.source)
    const bi = preferredSourceOrder.indexOf(b.source)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const base = sorted[0]
  const identifierMap = new Map<string, { type: string; identifier: string }>()

  for (const book of sorted) {
    for (const identifier of book.volumeInfo.industryIdentifiers || []) {
      const normalized = normalizeIdentifier(identifier.identifier)
      if (!normalized) continue
      identifierMap.set(`${identifier.type}:${normalized}`, {
        type: identifier.type,
        identifier: normalized,
      })
    }
  }

  let merged: GoogleBook = {
    ...base,
    volumeInfo: {
      ...base.volumeInfo,
      industryIdentifiers: Array.from(identifierMap.values()),
    },
  }

  for (const candidate of sorted.slice(1)) {
    const candidateCover = candidate.volumeInfo.imageLinks?.thumbnail || candidate.volumeInfo.imageLinks?.smallThumbnail
    const mergedCover = merged.volumeInfo.imageLinks?.thumbnail || merged.volumeInfo.imageLinks?.smallThumbnail

    merged = {
      ...merged,
      volumeInfo: {
        ...merged.volumeInfo,
        title: merged.volumeInfo.title || candidate.volumeInfo.title,
        authors:
          merged.volumeInfo.authors?.length
            ? merged.volumeInfo.authors
            : candidate.volumeInfo.authors,
        description: pickBetterDescription(merged.volumeInfo.description, candidate.volumeInfo.description),
        categories:
          merged.volumeInfo.categories?.length
            ? merged.volumeInfo.categories
            : candidate.volumeInfo.categories,
        industryIdentifiers: Array.from(identifierMap.values()),
        language: normalizeLanguage(merged.volumeInfo.language) || normalizeLanguage(candidate.volumeInfo.language),
        imageLinks:
          mergedCover || !candidateCover || !shouldAcceptCover(merged, candidate)
            ? merged.volumeInfo.imageLinks
            : candidate.volumeInfo.imageLinks,
        publisher: merged.volumeInfo.publisher || candidate.volumeInfo.publisher,
        publishedDate: pickBetterPublishedDate(merged.volumeInfo.publishedDate, candidate.volumeInfo.publishedDate),
        pageCount: merged.volumeInfo.pageCount || candidate.volumeInfo.pageCount,
        maturityRating: merged.volumeInfo.maturityRating || candidate.volumeInfo.maturityRating,
      },
    }
  }

  return merged
}

function combineDuplicateSearchResults(books: GoogleBook[]): GoogleBook[] {
  const grouped = new Map<string, GoogleBook[]>()

  for (const book of books) {
    const key = getBookGroupKey(book)
    const group = grouped.get(key)
    if (group) {
      group.push(book)
    } else {
      grouped.set(key, [book])
    }
  }

  return Array.from(grouped.values()).map((group) => mergeBookGroup(group))
}

export default function AddBookPage() {
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState<string>('')
  const [results, setResults] = useState<GoogleBook[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [addingBookId, setAddingBookId] = useState<string | null>(null)
  const [addedBooks, setAddedBooks] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [customPending, setCustomPending] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customAuthor, setCustomAuthor] = useState('')
  const [customSummary, setCustomSummary] = useState('')
  const [customPublisher, setCustomPublisher] = useState('')
  const [customPublishedDate, setCustomPublishedDate] = useState('')
  const [showManualForm, setShowManualForm] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    setError(null)
    try {
      const books = await searchBooks(query, language || undefined)
      const combinedBooks = combineDuplicateSearchResults(books)
      setResults(combinedBooks)
      if (combinedBooks.length === 0) {
        setError('No books found. Try a different search term.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to search books'
      setError(message.includes('rate') || message.includes('429') 
        ? 'Too many requests. Please wait a moment and try again.' 
        : 'Failed to search books. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  async function handleAddCustomBook(e: React.FormEvent) {
    e.preventDefault()
    setCustomPending(true)
    setError(null)
    try {
      const result = await addCustomBookToLibrary({
        title: customTitle,
        author: customAuthor,
        summary: customSummary,
        publisher: customPublisher,
        publishedDate: customPublishedDate,
      })

      if (result.success) {
        setCustomTitle('')
        setCustomAuthor('')
        setCustomSummary('')
        setCustomPublisher('')
        setCustomPublishedDate('')
      } else {
        setError(result.error || 'Failed to add book')
      }
    } catch {
      setError('Failed to add custom book. Please try again.')
    } finally {
      setCustomPending(false)
    }
  }

  async function handleAddBook(book: GoogleBook) {
    setAddingBookId(book.id)
    setError(null)

    try {
      const result = await addBookToLibrary(book)

      if (result.success) {
        setAddedBooks((prev) => new Set([...prev, book.id]))
      } else {
        console.error('Add book rejected:', { bookId: book.id, error: result.error })
        setError(result.error || 'Failed to add book')
      }

    } catch (error) {
      console.error('Add book failed:', error)

      setError(
        error instanceof Error
          ? error.message
          : 'Failed to add book. Check console.'
      )
    } finally {
      setAddingBookId(null)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Add a Book</h1>
        <p className="text-muted-foreground">
          Search multiple book catalogs to add to your library
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Books</CardTitle>
          <CardDescription>
            Search by title, author, or ISBN. Supports English and Hebrew books.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="query">Search Query</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="query"
                    placeholder="Enter book title, author, or ISBN..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Any Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Language</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="he">Hebrew</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={isSearching || !query.trim()} className="gap-2">
              {isSearching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Add Manually</CardTitle>
            <CardDescription>
              Can&apos;t find your book? Add it manually with title, author, summary and more.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant={showManualForm ? 'secondary' : 'default'}
            className="w-fit gap-2"
            onClick={() => setShowManualForm((prev) => !prev)}
          >
            {showManualForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showManualForm ? 'Hide Manual Form' : 'Add Manually'}
          </Button>
        </CardHeader>
        {showManualForm && (
          <CardContent>
            <form onSubmit={handleAddCustomBook} className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="custom-title">Title *</FieldLabel>
                  <Input
                    id="custom-title"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Book title"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="custom-author">Author</FieldLabel>
                  <Input
                    id="custom-author"
                    value={customAuthor}
                    onChange={(e) => setCustomAuthor(e.target.value)}
                    placeholder="Author name"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="custom-summary">Summary</FieldLabel>
                  <Input
                    id="custom-summary"
                    value={customSummary}
                    onChange={(e) => setCustomSummary(e.target.value)}
                    placeholder="Brief summary"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="custom-publisher">Publisher</FieldLabel>
                  <Input
                    id="custom-publisher"
                    value={customPublisher}
                    onChange={(e) => setCustomPublisher(e.target.value)}
                    placeholder="Publisher"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="custom-published-date">Published Date</FieldLabel>
                  <Input
                    id="custom-published-date"
                    value={customPublishedDate}
                    onChange={(e) => setCustomPublishedDate(e.target.value)}
                    placeholder="e.g. 2023 or 2023-06-01"
                  />
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={customPending || !customTitle.trim()}>
                {customPending ? 'Adding...' : 'Add Manually'}
              </Button>
            </form>
          </CardContent>
        )}
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              Found {results.length} books. Click to add to your library.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {results.map((book) => {
                const isAdded = addedBooks.has(book.id)
                const isAdding = addingBookId === book.id
                return (
                  <div
                    key={book.id}
                    className="flex gap-4 p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="w-20 h-28 flex-shrink-0 bg-muted rounded overflow-hidden">
                      {book.volumeInfo.imageLinks?.thumbnail ? (
                        <Image
                          src={book.volumeInfo.imageLinks.thumbnail.replace('http://', 'https://')}
                          alt={book.volumeInfo.title}
                          width={80}
                          height={112}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground line-clamp-2">
                        {book.volumeInfo.title}
                      </h3>
                      {book.volumeInfo.authors && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {book.volumeInfo.authors.join(', ')}
                        </p>
                      )}
                      {book.volumeInfo.publisher && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Publisher: {book.volumeInfo.publisher}
                        </p>
                      )}
                      {book.volumeInfo.publishedDate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {book.volumeInfo.publishedDate}
                        </p>
                      )}
                      {book.volumeInfo.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {book.volumeInfo.description}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Button
                        variant={isAdded ? 'secondary' : 'default'}
                        size="sm"
                        disabled={isAdding || isAdded}
                        onClick={() => handleAddBook(book)}
                        className="gap-2"
                      >
                        {isAdding ? (
                          <Spinner className="h-4 w-4" />
                        ) : isAdded ? (
                          <Check className="h-4 w-4" />
                        ) : null}
                        {isAdded ? 'Added' : isAdding ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
