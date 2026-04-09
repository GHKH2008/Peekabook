import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, BookOpen } from 'lucide-react'
import { UserSearchForm } from '@/components/user-search-form'
import { UserCard } from '@/components/user-card'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const user = await getSession()
  if (!user) return null

  let users: any[] = []
  
  if (params.q && params.q.trim()) {
    const searchTerm = `%${params.q.trim().toLowerCase()}%`
    users = await sql`
      SELECT u.id, u.username, u.display_name, u.bio, u.avatar_url, u.profile_visibility,
        (SELECT COUNT(*) FROM books WHERE user_id = u.id AND visibility = 'public') as book_count,
        (SELECT status FROM friendships 
         WHERE (user_id = ${user.id} AND friend_id = u.id) 
            OR (friend_id = ${user.id} AND user_id = u.id)
         LIMIT 1) as friendship_status
      FROM users u
      WHERE u.id != ${user.id}
        AND u.profile_visibility = 'public'
        AND (LOWER(u.username) LIKE ${searchTerm} 
          OR LOWER(u.display_name) LIKE ${searchTerm})
      ORDER BY u.username
      LIMIT 20
    `
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Find Users</h1>
        <p className="text-muted-foreground">
          Search for people to connect with and browse their book collections
        </p>
      </div>

      <UserSearchForm initialQuery={params.q || ''} />

      {params.q && (
        <Card>
          <CardHeader>
            <CardTitle>
              {users.length === 0 ? 'No results' : `${users.length} user${users.length === 1 ? '' : 's'} found`}
            </CardTitle>
            <CardDescription>
              {users.length === 0 
                ? 'Try a different search term' 
                : `Showing results for "${params.q}"`}
            </CardDescription>
          </CardHeader>
          {users.length > 0 && (
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {users.map((u) => (
                  <UserCard 
                    key={u.id} 
                    user={u} 
                    currentUserId={user.id}
                    showFriendButton 
                  />
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {!params.q && (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-medium mb-2">Search for users</h3>
            <p className="text-muted-foreground">
              Enter a username or display name to find people
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
