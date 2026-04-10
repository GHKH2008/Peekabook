'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Plus, Search, X } from 'lucide-react'
import { addCustomBookToLibrary, addSearchedBookToLibrary, searchBooks } from '@/app/actions/books'
import type { EnglishBookEdition, EnglishBookGroup } from '@/lib/book-search/types'

function prettifyFormat(label?: string, fallback?: string) {
  const value = (label || fallback || '').trim()
  if (!value) return 'Unknown format'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

function getEditionKey(book: EnglishBookEdition) {
  return (
    book.sourceEditionId ??
    `${book.title}-${book.formatLabel ?? book.format ?? 'unknown'}-${book.isbn13 ?? book.isbn ?? ''}-${book.publishedDate ?? ''}`
  )
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
  const [searchResults, setSearchResults] = useState<EnglishBookGroup[]>([])
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

  async function handleAddSearchedBook(book: EnglishBookEdition) {
    const key = getEditionKey(book)
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
          Search Amazon first, then choose a physical format or edition to add.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search (English)</CardTitle>
          <CardDescription>
            Results are grouped by book. Audiobooks and ebooks are excluded.
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

          <div className="space-y-4">
            {searchResults.map((group) => {
              const shortSummary = group.summary
                ? `${group.summary.slice(0, 180)}${group.summary.length > 180 ? '…' : ''}`
                : null

              return (
                <div key={group.groupId} className="rounded-lg border p-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="w-16 h-24 rounded-md border bg-muted/30 overflow-hidden shrink-0">
                      {group.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={group.cover} alt={`${group.title} cover`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground px-1 text-center">
                          No cover
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 flex-1">
                      <p className="font-semibold">{group.title}</p>

                      {group.series ? (
                        <p className="text-sm text-muted-foreground">Series: {group.series}</p>
                      ) : null}

                      {!!group.authors.length ? (
                        <p className="text-sm text-muted-foreground">By {group.authors.join(', ')}</p>
                      ) : null}

                      {shortSummary ? (
                        <p className="text-xs text-muted-foreground">{shortSummary}</p>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        {group.editions.map((edition) => {
                          const editionKey = getEditionKey(edition)
                          const label = [
                            prettifyFormat(edition.formatLabel, edition.format),
                            edition.pageCount ? `${edition.pageCount} pages` : null,
                            edition.publishedDate || null,
                          ]
                            .filter(Boolean)
                            .join(' • ')

                          return (
                            <Button
                              key={editionKey}
                              type="button"
                              variant="secondary"
                              disabled={addingBookKey === editionKey || addedBookKeys.has(editionKey)}
                              onClick={() => handleAddSearchedBook(edition)}
                              className="h-auto py-2 px-3"
                            >
                              {addingBookKey === editionKey
                                ? 'Adding...'
                                : addedBookKeys.has(editionKey)
                                  ? 'Added'
                                  : label || 'Add edition'}
                            </Button>
                          )
                        })}
                      </div>

                      <div className="space-y-1">
                        {group.editions.map((edition) => {
                          const editionKey = getEditionKey(edition)
                          return (
                            <div key={`${editionKey}-meta`} className="text-xs text-muted-foreground">
                              <span className="font-medium">
                                {prettifyFormat(edition.formatLabel, edition.format)}
                              </span>
                              {edition.publisher ? ` • ${edition.publisher}` : ''}
                              {edition.isbn13 ? ` • ISBN-13: ${edition.isbn13}` : edition.isbn ? ` • ISBN-10: ${edition.isbn}` : ''}
                            </div>
                          )
                        })}
                      </div>
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
