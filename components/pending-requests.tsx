'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Clock, Check, X } from 'lucide-react'
import { acceptFriendRequest, rejectFriendRequest } from '@/app/actions/friends'
import { useState, useTransition } from 'react'
import { Spinner } from '@/components/ui/spinner'

type Request = {
  id: number
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  friendship_id: number
  created_at: string
}

export function PendingRequests({ requests }: { requests: Request[] }) {
  const [handledIds, setHandledIds] = useState<Set<number>>(new Set())

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-medium mb-2">No pending requests</h3>
          <p className="text-muted-foreground">
            Friend requests you receive will appear here
          </p>
        </CardContent>
      </Card>
    )
  }

  const visibleRequests = requests.filter(r => !handledIds.has(r.friendship_id))

  if (visibleRequests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Check className="h-16 w-16 mx-auto mb-4 text-accent" />
          <h3 className="text-lg font-medium mb-2">All caught up!</h3>
          <p className="text-muted-foreground">
            {"You've handled all your friend requests"}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {visibleRequests.map((request) => (
        <RequestCard 
          key={request.friendship_id} 
          request={request}
          onHandled={() => setHandledIds(prev => new Set([...prev, request.friendship_id]))}
        />
      ))}
    </div>
  )
}

function RequestCard({ request, onHandled }: { request: Request; onHandled: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [action, setAction] = useState<'accept' | 'reject' | null>(null)

  async function handleAccept() {
    setAction('accept')
    startTransition(async () => {
      const result = await acceptFriendRequest(request.friendship_id)
      if (result.success) {
        onHandled()
      }
      setAction(null)
    })
  }

  async function handleReject() {
    setAction('reject')
    startTransition(async () => {
      const result = await rejectFriendRequest(request.friendship_id)
      if (result.success) {
        onHandled()
      }
      setAction(null)
    })
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Link href={`/user/${request.username}`}>
            <Avatar className="h-12 w-12">
              <AvatarImage src={request.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {(request.display_name || request.username).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/user/${request.username}`} className="hover:underline">
              <h3 className="font-medium text-foreground">
                {request.display_name || request.username}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground">@{request.username}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(request.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              onClick={handleAccept}
              disabled={isPending}
              className="gap-1"
            >
              {action === 'accept' ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Accept
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
        </div>
      </CardContent>
    </Card>
  )
}
