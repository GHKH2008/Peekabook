import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BookOpen,
  Calendar,
  Building2,
  Languages,
  Hash,
  ArrowLeft,
  Users,
  Lock,
  Globe,
  FileText,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { BookActions } from '@/components/book-actions'
import { BorrowRequestButton } from '@/components/borrow-request-button'

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getSession()
  if (!user) return null

  const bookId = parseInt(id)
  if (isNaN(bookId)) notFound()

  const books = await sql`
    SELECT b.*, u.username, u.display_name, u.id as owner_id
    FROM books b
    JOIN users u ON u.id = b.user_id
    WHERE b.id = ${bookId}
  `

  if (books.length === 0) notFound()

  const book = books[0]
  const isOwner = book.user_id === user.id

  if (!isOwner) {
    if (book.visibility === 'private') notFound()

    if (book.visibility === 'friends') {
      const friendship = await sql`
        SELECT id FROM friendships
        WHERE status = 'accepted'
        AND ((user_id = ${user.id} AND friend_id = ${book.user_id})
          OR (friend_id = ${user.id} AND user_id = ${book.user_id}))
      `
      if (friendship.length === 0) notFound()
    }
  }

  let loanHistory: any[] = []
  if (isOwner) {
    loanHistory = await sql`
      SELECT l.*, u.username, u.display_name
      FROM loans l
      JOIN users u ON u.id = l.borrower_id
      WHERE l.book_id = ${bookId}
      ORDER BY l.borrowed_at DESC
      LIMIT 10
    `
  }

  const visibilityConfig = {
    public: { icon: Globe, label: 'Public', color: 'bg-accent text-accent-foreground' },
    friends: { icon: Users, label: 'Friends Only', color: 'bg-secondary text-secondary-foreground' },
    private: { icon: Lock, label: 'Private', color: 'bg-muted text-muted-foreground' },
  }

  const vis = visibilityConfig[book.visibility as keyof typeof visibilityConfig]
  const VisIcon = vis.icon

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Link href={isOwner ? '/library' : `/user/${book.username}`}>
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {isOwner ? 'Back to Library' : `Back to ${book.display_name || book.username}'s Profile`}
        </Button>
      </Link>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="aspect-[2/3] relative bg-muted rounded-lg overflow-hidden">
            {book.cover_url ? (
              <Image
                src={book.cover_url}
                alt={book.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 256px"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <BookOpen className="h-16 w-16 text-muted-foreground/30" />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{book.title}</h1>
            {book.authors && book.authors.length > 0 && (
              <p className="text-lg text-muted-foreground mt-1">
                {book.authors.join(', ')}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {book.is_adult && (
              <Badge className="bg-destructive text-destructive-foreground">18+</Badge>
            )}
            <Badge className={vis.color}>
              <VisIcon className="h-3 w-3 mr-1" />
              {vis.label}
            </Badge>
            <Badge variant={book.availability === 'available' ? 'default' : 'secondary'}>
              {book.availability}
            </Badge>
          </div>

          {!isOwner && (
            <div className="py-2">
              <p className="text-sm text-muted-foreground">
                Owned by{' '}
                <Link href={`/user/${book.username}`} className="text-primary hover:underline">
                  @{book.username}
                </Link>
              </p>
            </div>
          )}

          {isOwner ? (
            <BookActions book={book} />
          ) : book.availability === 'available' ? (
            <BorrowRequestButton bookId={book.id} ownerId={book.owner_id} />
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {book.publisher && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                {book.publisher}
              </div>
            )}
            {book.published_date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {book.published_date}
              </div>
            )}
            {book.language && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Languages className="h-4 w-4" />
                {book.language.toUpperCase()}
              </div>
            )}
            {book.page_count && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                {book.page_count} pages
              </div>
            )}
            {(book.isbn || book.isbn_13) && (
              <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                <Hash className="h-4 w-4" />
                {book.isbn_13 || book.isbn}
              </div>
            )}
          </div>

          {book.genres && book.genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {book.genres.map((genre: string) => (
                <Badge key={genre} variant="outline">
                  {genre}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {book.summary && (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-line">{book.summary}</p>
          </CardContent>
        </Card>
      )}

      {isOwner && loanHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Loan History</CardTitle>
            <CardDescription>Recent loans for this book</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loanHistory.map((loan) => (
                <div
                  key={loan.id}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
                >
                  <div>
                    <Link
                      href={`/user/${loan.username}`}
                      className="font-medium hover:text-primary"
                    >
                      {loan.display_name || loan.username}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {new Date(loan.borrowed_at).toLocaleDateString()}
                      {loan.returned_at && (
                        <span> - {new Date(loan.returned_at).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>
                  <Badge variant={loan.status === 'active' ? 'default' : 'secondary'}>
                    {loan.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
