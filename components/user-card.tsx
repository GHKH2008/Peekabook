'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookOpen, UserPlus, UserCheck, Clock, UserX } from 'lucide-react'
import { sendFriendRequest } from '@/app/actions/friends'
import { useState, useTransition } from 'react'
import { Spinner } from '@/components/ui/spinner'

type UserWithMeta = {
  id: number
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  book_count?: number
  friendship_status?: string | null
}

export function UserCard({
  user,
  currentUserId,
  showFriendButton = false,
}: {
  user: UserWithMeta
  currentUserId: number
  showFriendButton?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [friendshipStatus, setFriendshipStatus] = useState(user.friendship_status)

  async function handleAddFriend() {
    startTransition(async () => {
      const result = await sendFriendRequest(user.id)
      if (result.success) {
        setFriendshipStatus('pending')
      }
    })
  }

  const statusConfig = {
    pending: { icon: Clock, label: 'Pending', variant: 'secondary' as const },
    accepted: { icon: UserCheck, label: 'Friends', variant: 'default' as const },
    rejected: { icon: UserX, label: 'Declined', variant: 'destructive' as const },
    blocked: { icon: UserX, label: 'Blocked', variant: 'destructive' as const },
  }

  const status = friendshipStatus ? statusConfig[friendshipStatus as keyof typeof statusConfig] : null

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Link href={`/user/${user.username}`}>
            <Avatar className="h-12 w-12">
              <AvatarImage src={user.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {(user.display_name || user.username).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/user/${user.username}`} className="hover:underline">
              <h3 className="font-medium text-foreground truncate">
                {user.display_name || user.username}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
            {user.bio && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{user.bio}</p>
            )}
            {user.book_count !== undefined && (
              <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                {user.book_count} {user.book_count === 1 ? 'book' : 'books'}
              </div>
            )}
          </div>
          {showFriendButton && user.id !== currentUserId && (
            <div className="flex-shrink-0">
              {status ? (
                <Badge variant={status.variant} className="gap-1">
                  <status.icon className="h-3 w-3" />
                  {status.label}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddFriend}
                  disabled={isPending}
                  className="gap-1"
                >
                  {isPending ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
