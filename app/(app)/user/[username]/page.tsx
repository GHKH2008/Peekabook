import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookOpen, Users, Lock, Globe, UserPlus, UserCheck, Clock } from 'lucide-react'
import Link from 'next/link'
import { BookCard } from '@/components/book-card'
import { AddFriendButton } from '@/components/add-friend-button'

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const currentUser = await getSession()
  if (!currentUser) return null

  const users = await sql`
    SELECT * FROM users WHERE username = ${username}
  `

  if (users.length === 0) notFound()

  const profileUser = users[0]
  const isOwnProfile = profileUser.id === currentUser.id

  // Check visibility
  if (!isOwnProfile && profileUser.profile_visibility === 'private') {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Lock className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold mb-2">Private Profile</h1>
        <p className="text-muted-foreground">This user has set their profile to private.</p>
      </div>
    )
  }

  // Check friendship status
  let friendshipStatus: string | null = null
  let friendshipId: number | null = null
  if (!isOwnProfile) {
    const friendship = await sql`
      SELECT id, status FROM friendships 
      WHERE (user_id = ${currentUser.id} AND friend_id = ${profileUser.id})
         OR (friend_id = ${currentUser.id} AND user_id = ${profileUser.id})
    `
    if (friendship.length > 0) {
      friendshipStatus = friendship[0].status
      friendshipId = friendship[0].id
    }
  }

  const isFriend = friendshipStatus === 'accepted'

  // Check if profile is friends-only and user is not a friend
  if (!isOwnProfile && profileUser.profile_visibility === 'friends' && !isFriend) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
        <h1 className="text-2xl font-bold mb-2">{profileUser.display_name || profileUser.username}</h1>
        <p className="text-muted-foreground mb-4">This user&apos;s profile is only visible to friends.</p>
        {!friendshipStatus && (
          <AddFriendButton userId={profileUser.id} />
        )}
      </div>
    )
  }

  // Get user's visible books
  let visibilityFilter = sql`visibility = 'public'`
  if (isOwnProfile) {
    visibilityFilter = sql`1=1` // Show all books
  } else if (isFriend) {
    visibilityFilter = sql`visibility IN ('public', 'friends')`
  }

  let books = await sql`
    SELECT * FROM books 
    WHERE user_id = ${profileUser.id} 
    AND ${visibilityFilter}
    ${currentUser.child_safe_mode ? sql`AND is_adult = false` : sql``}
    ORDER BY created_at DESC
  `

  // Get stats
  const friendCount = await sql`
    SELECT COUNT(*) as count FROM friendships 
    WHERE (user_id = ${profileUser.id} OR friend_id = ${profileUser.id}) 
    AND status = 'accepted'
  `

  const visibilityConfig = {
    public: { icon: Globe, label: 'Public Profile' },
    friends: { icon: Users, label: 'Friends Only' },
    private: { icon: Lock, label: 'Private' },
  }

  const vis = visibilityConfig[profileUser.profile_visibility as keyof typeof visibilityConfig]
  const VisIcon = vis.icon

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Profile Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profileUser.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                {(profileUser.display_name || profileUser.username).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <h1 className="text-2xl font-bold text-foreground">
                  {profileUser.display_name || profileUser.username}
                </h1>
                <Badge variant="secondary" className="w-fit gap-1">
                  <VisIcon className="h-3 w-3" />
                  {vis.label}
                </Badge>
              </div>
              <p className="text-muted-foreground">@{profileUser.username}</p>
              {profileUser.bio && (
                <p className="mt-3 text-foreground">{profileUser.bio}</p>
              )}
              <div className="flex gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BookOpen className="h-4 w-4" />
                  {books.length} {books.length === 1 ? 'book' : 'books'}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {friendCount[0].count} friends
                </div>
              </div>
            </div>
            {!isOwnProfile && (
              <div className="flex gap-2">
                {friendshipStatus === 'accepted' ? (
                  <Badge variant="secondary" className="gap-1">
                    <UserCheck className="h-3 w-3" />
                    Friends
                  </Badge>
                ) : friendshipStatus === 'pending' ? (
                  <Badge variant="outline" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Request Pending
                  </Badge>
                ) : (
                  <AddFriendButton userId={profileUser.id} />
                )}
              </div>
            )}
            {isOwnProfile && (
              <Link href="/settings">
                <Button variant="outline">Edit Profile</Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Books */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isOwnProfile ? 'My Books' : `${profileUser.display_name || profileUser.username}'s Books`}
          </CardTitle>
          <CardDescription>
            {isOwnProfile 
              ? 'All books in your library'
              : `Books shared by ${profileUser.display_name || profileUser.username}`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {books.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground">No books to display</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {books.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
