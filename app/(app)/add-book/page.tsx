'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Plus, Search, X } from 'lucide-react'
import { addCustomBookToLibrary, addSearchedBookToLibrary, searchBooks } from '@/app/actions/books'
import type { EnglishBook } from '@/lib/book-search/types'

function prettifyFormat(label?: string, fallback?: string) {
  const value = (label || fallback || '').trim()
  if (!value) return 'Unknown format'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

export default function AddBookPage() {
  const [error, setError] = useState<string | null>(null)
  const [customPending, setCustomPending] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customSeries, setCustomSeries] = useState('')
  const [customAuthor, setCustomAuthor] = useState('')
  const [customSummary, setCustomSummary] = useState('')
  const [customPublisher, setCustomPublisher] = useState('')
  const [customPublishedDate, setCustomPublishedDate] = useState('')
  const [showManualForm, setShowManualForm] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchPending, setSearchPending] = useState(false)
  const [searchResults, setSearchResults] = useState<EnglishBook[]>([])
  const [addingBookKey, setAddingBookKey] = useState<string | null>(null)
  const [addedBookKeys, setAddedBookKeys] = useState<Set<string>>(new Set())
  const [searchMessage, setSearchMessage] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchPending(true)
    setError(null)
    setSearchMessage(null)
    setAddedBookKeys(new Set())

    try {
      const results = await searchBooks(searchQuery)
      setSearchResults(results)
      if (results.length === 0) {
        setSearchMessage('No results found for this query.')
      }
    } catch {
      setError('Book search failed. Please try again.')
    } finally {
      setSearchPending(false)
    }
  }

  function getBookKey(book: EnglishBook) {
    return (
      book.sourceEditionId ??
      `${book.title}-${book.formatLabel ?? book.format ?? 'unknown'}-${book.isbn13 ?? book.isbn ?? book.authors[0] ?? ''}`
    )
  }

  async function handleAddSearchedBook(book: EnglishBook) {
    const key = getBookKey(book)
    setAddingBookKey(key)
    setError(null)
    setSearchMessage(null)

    try {
      const result = await addSearchedBookToLibrary({
        title: book.title,
        series: book.series,
        authors: book.authors,
        summary: book.summary,
        genres: book.genres,
        isbn: book.isbn,
        isbn13: book.isbn13,
        language: book.language,
        cover: book.cover,
        publisher: book.publisher,
        publishedDate: book.publishedDate,
        pageCount: book.pageCount,
        sourceRefs: book.sourceRefs,
        sourceTrace: book.sourceTrace,
      })

      if (!result.success) {
        setError(result.error || 'Failed to add searched book')
      } else {
        setAddedBookKeys((prev) => new Set(prev).add(key))
        setSearchMessage(`Added “${book.title}” to your library.`)
      }
    } catch {
      setError('Failed to add searched book. Please try again.')
    } finally {
      setAddingBookKey(null)
    }
  }

  async function handleAddCustomBook(e: React.FormEvent) {
    e.preventDefault()
    setCustomPending(true)
    setError(null)

    try {
      const result = await addCustomBookToLibrary({
        title: customTitle,
        series: customSeries,
        author: customAuthor,
        summary: customSummary,
        publisher: customPublisher,
        publishedDate: customPublishedDate,
      })

      if (result.success) {
        setCustomTitle('')
        setCustomSeries('')
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Add a Book</h1>
        <p className="text-muted-foreground">
          English search keeps separate formats and editions so you can choose the exact book you want.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search (English)</CardTitle>
          <CardDescription>
            Amazon editions first, then fill missing fields from Google, Open Library, and extras only when needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title (English)"
            />
            <Button type="submit" disabled={!searchQuery.trim() || searchPending} className="gap-2">
              <Search className="h-4 w-4" />
              {searchPending ? 'Searching...' : 'Search'}
            </Button>
          </form>

          <div className="space-y-3">
            {searchResults.map((book) => {
              const key = getBookKey(book)
              const shortSummary = book.summary
                ? `${book.summary.slice(0, 180)}${book.summary.length > 180 ? '…' : ''}`
                : null

              return (
                <div key={key} className="rounded-lg border p-3 space-y-3">
                  <div className="flex gap-3">
                    <div className="w-16 h-24 rounded-md border bg-muted/30 overflow-hidden shrink-0">
                      {book.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={book.cover} alt={`${book.title} cover`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground px-1 text-center">
                          No cover
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{book.title}</p>
                        <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">
                          {prettifyFormat(book.formatLabel, book.format)}
                        </span>
                        {book.pageCount ? (
                          <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">
                            {book.pageCount} pages
                          </span>
                        ) : null}
                      </div>

                      {book.series ? (
                        <p className="text-sm text-muted-foreground">Series: {book.series}</p>
                      ) : null}

                      {!!book.authors.length ? (
                        <p className="text-sm text-muted-foreground">By {book.authors.join(', ')}</p>
                      ) : null}

                      <p className="text-xs text-muted-foreground">
                        {book.publisher || 'Unknown publisher'} • {book.publishedDate || 'Unknown date'}
                      </p>

                      {book.narrator ? (
                        <p className="text-xs text-muted-foreground">Narrator: {book.narrator}</p>
                      ) : null}

                      {book.isbn13 ? (
                        <p className="text-xs text-muted-foreground">ISBN-13: {book.isbn13}</p>
                      ) : book.isbn ? (
                        <p className="text-xs text-muted-foreground">ISBN-10: {book.isbn}</p>
                      ) : null}

                      {shortSummary ? <p className="text-xs text-muted-foreground">{shortSummary}</p> : null}

                      <Button
                        type="button"
                        variant="secondary"
                        disabled={addingBookKey === key || addedBookKeys.has(key)}
                        onClick={() => handleAddSearchedBook(book)}
                      >
                        {addingBookKey === key ? 'Adding...' : addedBookKeys.has(key) ? 'Added' : 'Add to Library'}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}

            {!searchPending && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground">No English search results yet. Try an English title.</p>
            )}

            {searchMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{searchMessage}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Add Manually</CardTitle>
            <CardDescription>Start from zero and add a book with title, series, author, summary and more.</CardDescription>
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
                  <FieldLabel htmlFor="custom-series">Series</FieldLabel>
                  <Input
                    id="custom-series"
                    value={customSeries}
                    onChange={(e) => setCustomSeries(e.target.value)}
                    placeholder="Series name"
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
                    placeholder="Short summary"
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
                    placeholder="YYYY or YYYY-MM-DD"
                  />
                </Field>
              </FieldGroup>

              <Button type="submit" disabled={customPending || !customTitle.trim()}>
                {customPending ? 'Adding...' : 'Add Book'}
              </Button>
            </form>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
