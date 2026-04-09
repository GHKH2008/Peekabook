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

  let books = await sql`
    SELECT * FROM books 
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `

  // Apply filters
  if (params.availability && params.availability !== 'all') {
    books = books.filter(book => book.availability === params.availability)
  }
  if (params.visibility && params.visibility !== 'all') {
    books = books.filter(book => book.visibility === params.visibility)
  }
  if (params.search) {
    const searchLower = params.search.toLowerCase()
    books = books.filter(book => 
      book.title.toLowerCase().includes(searchLower) ||
      (book.authors && book.authors.some((a: string) => a.toLowerCase().includes(searchLower)))
    )
  }

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
