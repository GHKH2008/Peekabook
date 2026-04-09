'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field'
import { Plus, X } from 'lucide-react'
import { addCustomBookToLibrary } from '@/app/actions/books'

export default function AddBookPage() {
  const [error, setError] = useState<string | null>(null)
  const [customPending, setCustomPending] = useState(false)
  const [customTitle, setCustomTitle] = useState('')
  const [customAuthor, setCustomAuthor] = useState('')
  const [customSummary, setCustomSummary] = useState('')
  const [customPublisher, setCustomPublisher] = useState('')
  const [customPublishedDate, setCustomPublishedDate] = useState('')
  const [showManualForm, setShowManualForm] = useState(true)

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

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Add a Book</h1>
        <p className="text-muted-foreground">Book search has been removed. Add entries manually for now.</p>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div>
            <CardTitle>Add Manually</CardTitle>
            <CardDescription>
              Start from zero and add a book with title, author, summary and more.
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

              {error && <p className="text-sm text-destructive">{error}</p>}

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
