import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { LentBooks } from '@/components/lent-books'
import { BorrowedBooks } from '@/components/borrowed-books'

export default async function LoansPage() {
  const user = await getSession()
  if (!user) return null

  // Get books I've lent out
  const lentLoans = await sql`
    SELECT 
      l.*,
      b.title as book_title, b.cover_url, b.authors, b.id as book_id,
      u.username as borrower_username, u.display_name as borrower_name, u.avatar_url as borrower_avatar
    FROM loans l
    JOIN books b ON b.id = l.book_id
    JOIN users u ON u.id = l.borrower_id
    WHERE l.lender_id = ${user.id}
    ORDER BY 
      CASE WHEN l.status = 'active' THEN 0 ELSE 1 END,
      l.borrowed_at DESC
    LIMIT 50
  `

  // Get books I've borrowed
  const borrowedLoans = await sql`
    SELECT 
      l.*,
      b.title as book_title, b.cover_url, b.authors, b.id as book_id,
      u.username as lender_username, u.display_name as lender_name, u.avatar_url as lender_avatar
    FROM loans l
    JOIN books b ON b.id = l.book_id
    JOIN users u ON u.id = l.lender_id
    WHERE l.borrower_id = ${user.id}
    ORDER BY 
      CASE WHEN l.status = 'active' THEN 0 ELSE 1 END,
      l.borrowed_at DESC
    LIMIT 50
  `

  const activeLent = lentLoans.filter(l => l.status === 'active').length
  const activeBorrowed = borrowedLoans.filter(l => l.status === 'active').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Loan Tracking</h1>
        <p className="text-muted-foreground">
          Keep track of books you&apos;ve lent and borrowed
        </p>
      </div>

      <Tabs defaultValue="lent">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lent" className="gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Lent Out
            {activeLent > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {activeLent}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="borrowed" className="gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            Borrowed
            {activeBorrowed > 0 && (
              <span className="bg-secondary text-secondary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {activeBorrowed}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lent" className="mt-6">
          <LentBooks loans={lentLoans} />
        </TabsContent>

        <TabsContent value="borrowed" className="mt-6">
          <BorrowedBooks loans={borrowedLoans} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
