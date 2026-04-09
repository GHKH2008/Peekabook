import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, Clock, UserCheck, BookOpen } from 'lucide-react'
import { FriendsList } from '@/components/friends-list'
import { PendingRequests } from '@/components/pending-requests'
import { FriendsBooks } from '@/components/friends-books'

export default async function FriendsPage() {
  const user = await getSession()
  if (!user) return null

  // Get friends
  const friends = await sql`
    SELECT 
      u.id, u.username, u.display_name, u.bio, u.avatar_url,
      f.id as friendship_id,
      (SELECT COUNT(*) FROM books WHERE user_id = u.id AND visibility IN ('public', 'friends')) as book_count
    FROM friendships f
    JOIN users u ON (
      CASE 
        WHEN f.user_id = ${user.id} THEN f.friend_id = u.id
        ELSE f.user_id = u.id
      END
    )
    WHERE (f.user_id = ${user.id} OR f.friend_id = ${user.id})
      AND f.status = 'accepted'
    ORDER BY u.display_name, u.username
  `

  // Get pending requests (where current user is the recipient)
  const pendingRequests = await sql`
    SELECT 
      u.id, u.username, u.display_name, u.bio, u.avatar_url,
      f.id as friendship_id, f.created_at
    FROM friendships f
    JOIN users u ON f.user_id = u.id
    WHERE f.friend_id = ${user.id} AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `

  // Get books from friends
  const friendsBooks = await sql`
    SELECT 
      b.*, u.username, u.display_name
    FROM books b
    JOIN users u ON u.id = b.user_id
    JOIN friendships f ON (
      (f.user_id = ${user.id} AND f.friend_id = b.user_id) OR
      (f.friend_id = ${user.id} AND f.user_id = b.user_id)
    )
    WHERE f.status = 'accepted'
      AND b.visibility IN ('public', 'friends')
      ${user.child_safe_mode ? sql`AND b.is_adult = false` : sql``}
    ORDER BY b.created_at DESC
    LIMIT 30
  `

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Friends</h1>
        <p className="text-muted-foreground">
          Manage your connections and browse their book collections
        </p>
      </div>

      <Tabs defaultValue="friends">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="friends" className="gap-2">
            <UserCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Friends</span>
            <span className="text-xs">({friends.length})</span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Requests</span>
            <span className="text-xs">({pendingRequests.length})</span>
          </TabsTrigger>
          <TabsTrigger value="books" className="gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Books</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-6">
          <FriendsList friends={friends} />
        </TabsContent>

        <TabsContent value="requests" className="mt-6">
          <PendingRequests requests={pendingRequests} />
        </TabsContent>

        <TabsContent value="books" className="mt-6">
          <FriendsBooks books={friendsBooks} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
