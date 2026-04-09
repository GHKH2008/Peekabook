import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BookOpen, ArrowDownLeft } from 'lucide-react'

type Loan = {
  id: number
  book_id: number
  status: string
  borrowed_at: string
  returned_at: string | null
  book_title: string
  cover_url: string | null
  authors: string[] | null
  lender_username: string
  lender_name: string | null
  lender_avatar: string | null
}

export function BorrowedBooks({ loans }: { loans: Loan[] }) {
  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ArrowDownLeft className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-medium mb-2">No borrowed books</h3>
          <p className="text-muted-foreground">
            {"Books you've borrowed will appear here"}
          </p>
        </CardContent>
      </Card>
    )
  }

  const statusColors = {
    active: 'bg-accent text-accent-foreground',
    returned: 'bg-muted text-muted-foreground',
    overdue: 'bg-destructive text-destructive-foreground',
  }

  return (
    <div className="space-y-4">
      {loans.map((loan) => (
        <Card key={loan.id}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <Link href={`/book/${loan.book_id}`} className="flex-shrink-0">
                <div className="w-16 h-24 bg-muted rounded overflow-hidden">
                  {loan.cover_url ? (
                    <Image
                      src={loan.cover_url}
                      alt={loan.book_title}
                      width={64}
                      height={96}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/book/${loan.book_id}`} className="hover:underline">
                      <h3 className="font-medium text-foreground line-clamp-1">
                        {loan.book_title}
                      </h3>
                    </Link>
                    {loan.authors && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {loan.authors.join(', ')}
                      </p>
                    )}
                  </div>
                  <Badge className={statusColors[loan.status as keyof typeof statusColors]}>
                    {loan.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">From:</span>
                  <Link href={`/user/${loan.lender_username}`}>
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={loan.lender_avatar || undefined} />
                      <AvatarFallback className="text-xs">
                        {(loan.lender_name || loan.lender_username).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <Link href={`/user/${loan.lender_username}`} className="text-sm hover:underline">
                    {loan.lender_name || loan.lender_username}
                  </Link>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Since {new Date(loan.borrowed_at).toLocaleDateString()}
                  {loan.returned_at && (
                    <span> - Returned {new Date(loan.returned_at).toLocaleDateString()}</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
