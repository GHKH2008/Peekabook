import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { BookCard } from '@/components/book-card'
import { LibraryFilters } from '@/components/library-filters'

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ availability?: string; visibility?: string; search?: string }>
}) {
  const params = await searchParams
  const user = await getSession()
  if (!user) return null

  const normalizedSearch = params.search?.trim() || null
  const availability = params.availability && params.availability !== 'all' ? params.availability : null
  const visibility = params.visibility && params.visibility !== 'all' ? params.visibility : null

  const books = await sql`
    SELECT *
    FROM books
    WHERE user_id = ${user.id}
      AND (${availability}::text IS NULL OR availability = ${availability})
      AND (${visibility}::text IS NULL OR visibility = ${visibility})
      AND (
        ${normalizedSearch}::text IS NULL
        OR title ILIKE ${`%${normalizedSearch}%`}
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(authors, ARRAY[]::text[])) author
          WHERE author ILIKE ${`%${normalizedSearch}%`}
        )
        OR COALESCE(summary, '') ILIKE ${`%${normalizedSearch}%`}
        OR COALESCE(publisher, '') ILIKE ${`%${normalizedSearch}%`}
        OR COALESCE(published_date, '') ILIKE ${`%${normalizedSearch}%`}
        OR COALESCE(isbn, '') ILIKE ${`%${normalizedSearch}%`}
        OR COALESCE(isbn_13, '') ILIKE ${`%${normalizedSearch}%`}
      )
    ORDER BY created_at DESC
  `

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Library</h1>
          <p className="text-muted-foreground">
            {books.length} {books.length === 1 ? 'book' : 'books'} in your collection
          </p>
        </div>
        <Link href="/add-book">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add Book
          </Button>
        </Link>
      </div>

      <LibraryFilters />

      {books.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-medium mb-2">No books yet</h3>
            <p className="text-muted-foreground mb-4">
              Start building your library by adding your first book
            </p>
            <Link href="/add-book">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Your First Book
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  )
}
