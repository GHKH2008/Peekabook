import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Lock, Users } from 'lucide-react'
import type { Book } from '@/lib/db'

type BookWithOwner = Book & {
  username?: string
  display_name?: string | null
}

export function BookCard({
  book,
  showOwner = false,
}: {
  book: BookWithOwner
  showOwner?: boolean
}) {
  const availabilityColors = {
    available: 'bg-accent text-accent-foreground',
    requested: 'bg-chart-4 text-foreground',
    loaned: 'bg-muted text-muted-foreground',
    unavailable: 'bg-muted text-muted-foreground',
  }

  const visibilityIcons = {
    public: null,
    friends: <Users className="h-3 w-3" />,
    private: <Lock className="h-3 w-3" />,
  }

  return (
    <Link href={`/book/${book.id}`}>
      <Card className="group overflow-hidden hover:shadow-lg transition-shadow h-full">
        <div className="aspect-[2/3] relative bg-muted">
          {book.cover_url ? (
            <Image
              src={book.cover_url}
              alt={book.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 16vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          {book.is_adult && (
            <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground text-xs">
              18+
            </Badge>
          )}
          {visibilityIcons[book.visibility] && (
            <div className="absolute top-2 right-2 bg-background/80 rounded-full p-1">
              {visibilityIcons[book.visibility]}
            </div>
          )}
        </div>
        <CardContent className="p-3">
          <h3 className="font-medium text-sm line-clamp-2 text-foreground group-hover:text-primary transition-colors">
            {book.title}
          </h3>
          {book.authors && book.authors.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {book.authors.join(', ')}
            </p>
          )}
          {showOwner && book.username && (
            <p className="text-xs text-muted-foreground mt-1">
              by @{book.username}
            </p>
          )}
          <Badge
            variant="secondary"
            className={`mt-2 text-xs ${availabilityColors[book.availability]}`}
          >
            {book.availability}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  )
}
