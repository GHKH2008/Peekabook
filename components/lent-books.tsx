'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { BookOpen, ArrowUpRight, RotateCcw } from 'lucide-react'
import { markLoanReturned } from '@/app/actions/borrow'
import { useState, useTransition } from 'react'

type Loan = {
  id: number
  book_id: number
  status: string
  borrowed_at: string
  returned_at: string | null
  book_title: string
  cover_url: string | null
  authors: string[] | null
  borrower_username: string
  borrower_name: string | null
  borrower_avatar: string | null
}

export function LentBooks({ loans }: { loans: Loan[] }) {
  const [returnedIds, setReturnedIds] = useState<Set<number>>(new Set())

  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ArrowUpRight className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-medium mb-2">No books lent out</h3>
          <p className="text-muted-foreground">
            When you lend books to others, they&apos;ll appear here
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {loans.map((loan) => (
        <LoanCard
          key={loan.id}
          loan={loan}
          isReturned={returnedIds.has(loan.id)}
          onReturned={() => setReturnedIds(prev => new Set([...prev, loan.id]))}
        />
      ))}
    </div>
  )
}

function LoanCard({ 
  loan, 
  isReturned,
  onReturned 
}: { 
  loan: Loan
  isReturned: boolean
  onReturned: () => void 
}) {
  const [isPending, startTransition] = useTransition()

  const statusColors = {
    active: 'bg-accent text-accent-foreground',
    returned: 'bg-muted text-muted-foreground',
    overdue: 'bg-destructive text-destructive-foreground',
  }

  async function handleReturn() {
    startTransition(async () => {
      const result = await markLoanReturned(loan.id)
      if (result.success) {
        onReturned()
      }
    })
  }

  const isActive = loan.status === 'active' && !isReturned

  return (
    <Card>
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
              <Badge className={isReturned ? statusColors.returned : statusColors[loan.status as keyof typeof statusColors]}>
                {isReturned ? 'returned' : loan.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Borrowed by:</span>
              <Link href={`/user/${loan.borrower_username}`}>
                <Avatar className="h-6 w-6">
                  <AvatarImage src={loan.borrower_avatar || undefined} />
                  <AvatarFallback className="text-xs">
                    {(loan.borrower_name || loan.borrower_username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <Link href={`/user/${loan.borrower_username}`} className="text-sm hover:underline">
                {loan.borrower_name || loan.borrower_username}
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
        {isActive && (
          <div className="flex justify-end mt-4">
            <Button
              size="sm"
              onClick={handleReturn}
              disabled={isPending}
              className="gap-1"
            >
              {isPending ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              Mark Returned
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
