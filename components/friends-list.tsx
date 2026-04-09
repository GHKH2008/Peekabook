'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { BookOpen, UserMinus, Users } from 'lucide-react'
import { removeFriend } from '@/app/actions/friends'
import { useState, useTransition } from 'react'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Friend = {
  id: number
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  book_count: number
  friendship_id: number
}

export function FriendsList({ friends }: { friends: Friend[] }) {
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set())

  if (friends.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-medium mb-2">No friends yet</h3>
          <p className="text-muted-foreground mb-4">
            Search for users to add as friends
          </p>
          <Link href="/users">
            <Button>Find Friends</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const visibleFriends = friends.filter(f => !removedIds.has(f.id))

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visibleFriends.map((friend) => (
        <FriendCard 
          key={friend.id} 
          friend={friend} 
          onRemoved={() => setRemovedIds(prev => new Set([...prev, friend.id]))}
        />
      ))}
    </div>
  )
}

function FriendCard({ friend, onRemoved }: { friend: Friend; onRemoved: () => void }) {
  const [isPending, startTransition] = useTransition()

  async function handleRemove() {
    startTransition(async () => {
      const result = await removeFriend(friend.id)
      if (result.success) {
        onRemoved()
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Link href={`/user/${friend.username}`}>
            <Avatar className="h-12 w-12">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {(friend.display_name || friend.username).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/user/${friend.username}`} className="hover:underline">
              <h3 className="font-medium text-foreground truncate">
                {friend.display_name || friend.username}
              </h3>
            </Link>
            <p className="text-sm text-muted-foreground">@{friend.username}</p>
            <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
              <BookOpen className="h-4 w-4" />
              {friend.book_count} {friend.book_count === 1 ? 'book' : 'books'}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Link href={`/user/${friend.username}`} className="flex-1">
            <Button variant="secondary" size="sm" className="w-full">
              View Books
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                <UserMinus className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove friend?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove {friend.display_name || friend.username} from your friends list.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemove} disabled={isPending}>
                  {isPending && <Spinner className="mr-2 h-4 w-4" />}
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
