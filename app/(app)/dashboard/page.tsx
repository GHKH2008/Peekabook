import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BookOpen, Users, BookMarked, Clock, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { BookCard } from '@/components/book-card'

async function getDashboardStats(userId: number) {
  const [booksCount, friendsCount, requestsCount, activeLoansCount] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM books WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as count FROM friendships WHERE (user_id = ${userId} OR friend_id = ${userId}) AND status = 'accepted'`,
    sql`SELECT COUNT(*) as count FROM borrow_requests WHERE owner_id = ${userId} AND status = 'pending'`,
    sql`SELECT COUNT(*) as count FROM loans WHERE lender_id = ${userId} AND status = 'active'`,
  ])

  return {
    books: Number(booksCount[0].count),
    friends: Number(friendsCount[0].count),
    pendingRequests: Number(requestsCount[0].count),
    activeLoans: Number(activeLoansCount[0].count),
  }
}

async function getRecentBooks(userId: number, childSafeMode: boolean) {
  const books = await sql`
    SELECT b.*, u.username, u.display_name 
    FROM books b
    JOIN users u ON u.id = b.user_id
    JOIN friendships f ON (
      (f.user_id = ${userId} AND f.friend_id = b.user_id) OR
      (f.friend_id = ${userId} AND f.user_id = b.user_id)
    )
    WHERE f.status = 'accepted'
    AND b.visibility IN ('public', 'friends')
    AND b.user_id != ${userId}
    ${childSafeMode ? sql`AND b.is_adult = false` : sql``}
    ORDER BY b.created_at DESC
    LIMIT 6
  `
  return books
}

export default async function DashboardPage() {
  const user = await getSession()
  if (!user) return null

  const [stats, recentBooks] = await Promise.all([
    getDashboardStats(user.id),
    getRecentBooks(user.id, user.child_safe_mode),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Welcome back, {user.display_name || user.username}
        </h1>
        <p className="text-muted-foreground">
          {"Here's what's happening in your book community"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              My Books
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.books}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.friends}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <BookMarked className="h-4 w-4" />
              Pending Requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pendingRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Active Loans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.activeLoans}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/add-book">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Add a Book
          </Button>
        </Link>
        <Link href="/users">
          <Button variant="outline" className="gap-2">
            <Users className="h-4 w-4" />
            Find Friends
          </Button>
        </Link>
        {stats.pendingRequests > 0 && (
          <Link href="/requests">
            <Button variant="secondary" className="gap-2">
              <BookMarked className="h-4 w-4" />
              View Requests ({stats.pendingRequests})
            </Button>
          </Link>
        )}
      </div>

      {/* Recent Books from Friends */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{"Books from Friends"}</CardTitle>
              <CardDescription>Recently added by people you follow</CardDescription>
            </div>
            <Link href="/friends">
              <Button variant="ghost" size="sm" className="gap-2">
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentBooks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No books from friends yet</p>
              <p className="text-sm">Add some friends to see their book collections!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {recentBooks.map((book) => (
                <BookCard key={book.id} book={book} showOwner />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
