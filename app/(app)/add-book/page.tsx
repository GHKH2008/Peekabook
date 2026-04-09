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
import { buildMergedDisplayModel } from '@/lib/book-merge'
import { Badge } from '@/components/ui/badge'

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    setError(null)
    try {
      const books = await searchBooks(query, language || undefined)
      setResults(books)
      if (books.length === 0) {
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

  function toggleGroup(groupKey: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
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
              Showing {results.length} grouped books. Add the primary edition or choose a variant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {results.map((book) => {
                const isAdded = addedBooks.has(book.id)
                const isAdding = addingBookId === book.id
                const display = buildMergedDisplayModel(book)
                const groupKey = book.groupId || book.id
                const editions = book.editions || []
                const isExpanded = expandedGroups.has(groupKey)
                const primaryYear = book.volumeInfo.publishedDate?.match(/\d{4}/)?.[0]
                return (
                  <div
                    key={groupKey}
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex gap-4">
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
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-foreground line-clamp-2">
                            {book.volumeInfo.title}
                          </h3>
                          {book.source && (
                            <Badge variant="secondary" className="text-[10px]">{book.source}</Badge>
                          )}
                        </div>
                        {book.volumeInfo.authors && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {book.volumeInfo.authors.join(', ')}
                            {primaryYear ? ` • ${primaryYear}` : ''}
                          </p>
                        )}
                        {book.volumeInfo.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {book.volumeInfo.description}
                          </p>
                        )}
                        {display.sourceSummary && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Sources: {display.sourceSummary}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex flex-col gap-2 items-end">
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
                        {editions.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleGroup(groupKey)}
                          >
                            {isExpanded ? 'Hide editions' : `More editions (${editions.length})`}
                          </Button>
                        )}
                      </div>
                    </div>
                    {isExpanded && editions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        {editions.map((edition) => {
                          const editionAdded = addedBooks.has(edition.id)
                          const editionAdding = addingBookId === edition.id
                          const editionYear = edition.volumeInfo.publishedDate?.match(/\d{4}/)?.[0]
                          return (
                            <div key={edition.id} className="flex items-center justify-between rounded-md bg-muted/40 p-2 gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{edition.volumeInfo.title}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {(edition.volumeInfo.authors || []).join(', ') || 'Unknown author'}
                                  {editionYear ? ` • ${editionYear}` : ''}
                                </p>
                              </div>
                              <Button
                                variant={editionAdded ? 'secondary' : 'outline'}
                                size="sm"
                                disabled={editionAdding || editionAdded}
                                onClick={() => handleAddBook(edition)}
                              >
                                {editionAdded ? 'Added' : editionAdding ? 'Adding...' : 'Add'}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
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
