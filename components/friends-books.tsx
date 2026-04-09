import { Card, CardContent } from '@/components/ui/card'
import { BookOpen } from 'lucide-react'
import { BookCard } from '@/components/book-card'
import type { Book } from '@/lib/db'

type BookWithOwner = Book & {
  username: string
  display_name: string | null
}

export function FriendsBooks({ books }: { books: BookWithOwner[] }) {
  if (books.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-medium mb-2">No books to show</h3>
          <p className="text-muted-foreground">
            Books from your friends will appear here
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {books.map((book) => (
        <BookCard key={book.id} book={book} showOwner />
      ))}
    </div>
  )
}
