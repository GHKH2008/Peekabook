'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { BookOpen, Inbox, Check, X } from 'lucide-react'
import { approveBorrowRequest, rejectBorrowRequest } from '@/app/actions/borrow'
import { useState, useTransition } from 'react'

type Request = {
  id: number
  book_id: number
  status: string
  message: string | null
  created_at: string
  book_title: string
  cover_url: string | null
  authors: string[] | null
  requester_username: string
  requester_name: string | null
  requester_avatar: string | null
}

export function IncomingRequests({ requests }: { requests: Request[] }) {
  const [handledIds, setHandledIds] = useState<Set<number>>(new Set())

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Inbox className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-medium mb-2">No incoming requests</h3>
          <p className="text-muted-foreground">
            When someone wants to borrow your books, their requests will appear here
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          isHandled={handledIds.has(request.id)}
          onHandled={() => setHandledIds(prev => new Set([...prev, request.id]))}
        />
      ))}
    </div>
  )
}

function RequestCard({ 
  request, 
  isHandled,
  onHandled 
}: { 
  request: Request
  isHandled: boolean
  onHandled: () => void 
}) {
  const [isPending, startTransition] = useTransition()
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)

  const statusColors = {
    pending: 'bg-chart-4 text-foreground',
    approved: 'bg-accent text-accent-foreground',
    rejected: 'bg-muted text-muted-foreground',
    cancelled: 'bg-muted text-muted-foreground',
  }

  async function handleApprove() {
    setAction('approve')
    startTransition(async () => {
      const result = await approveBorrowRequest(request.id)
      if (result.success) {
        onHandled()
      }
      setAction(null)
    })
  }

  async function handleReject() {
    setAction('reject')
    startTransition(async () => {
      const result = await rejectBorrowRequest(request.id)
      if (result.success) {
        onHandled()
      }
      setAction(null)
    })
  }

  const isPendingRequest = request.status === 'pending' && !isHandled

  return (
    <Card className={isHandled ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Link href={`/book/${request.book_id}`} className="flex-shrink-0">
            <div className="w-16 h-24 bg-muted rounded overflow-hidden">
              {request.cover_url ? (
                <Image
                  src={request.cover_url}
                  alt={request.book_title}
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
                <Link href={`/book/${request.book_id}`} className="hover:underline">
                  <h3 className="font-medium text-foreground line-clamp-1">
                    {request.book_title}
                  </h3>
                </Link>
                {request.authors && (
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {request.authors.join(', ')}
                  </p>
                )}
              </div>
              <Badge className={statusColors[request.status as keyof typeof statusColors]}>
                {isHandled ? (action === 'approve' ? 'Approved' : 'Rejected') : request.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Link href={`/user/${request.requester_username}`}>
                <Avatar className="h-6 w-6">
                  <AvatarImage src={request.requester_avatar || undefined} />
                  <AvatarFallback className="text-xs">
                    {(request.requester_name || request.requester_username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <Link href={`/user/${request.requester_username}`} className="text-sm hover:underline">
                {request.requester_name || request.requester_username}
              </Link>
              <span className="text-sm text-muted-foreground">
                {new Date(request.created_at).toLocaleDateString()}
              </span>
            </div>
            {request.message && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                &quot;{request.message}&quot;
              </p>
            )}
          </div>
        </div>
        {isPendingRequest && (
          <div className="flex gap-2 mt-4 justify-end">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isPending}
              className="gap-1"
            >
              {action === 'approve' ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReject}
              disabled={isPending}
              className="gap-1"
            >
              {action === 'reject' ? <Spinner className="h-4 w-4" /> : <X className="h-4 w-4" />}
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
