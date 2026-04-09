import { getSession } from '@/lib/auth'
import { sql } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookMarked, Send, Inbox } from 'lucide-react'
import { IncomingRequests } from '@/components/incoming-requests'
import { OutgoingRequests } from '@/components/outgoing-requests'

export default async function RequestsPage() {
  const user = await getSession()
  if (!user) return null

  // Get incoming requests (as book owner)
  const incomingRequests = await sql`
    SELECT 
      br.*,
      b.title as book_title, b.cover_url, b.authors,
      u.username as requester_username, u.display_name as requester_name, u.avatar_url as requester_avatar
    FROM borrow_requests br
    JOIN books b ON b.id = br.book_id
    JOIN users u ON u.id = br.requester_id
    WHERE br.owner_id = ${user.id}
    ORDER BY 
      CASE WHEN br.status = 'pending' THEN 0 ELSE 1 END,
      br.created_at DESC
    LIMIT 50
  `

  // Get outgoing requests (as requester)
  const outgoingRequests = await sql`
    SELECT 
      br.*,
      b.title as book_title, b.cover_url, b.authors,
      u.username as owner_username, u.display_name as owner_name, u.avatar_url as owner_avatar
    FROM borrow_requests br
    JOIN books b ON b.id = br.book_id
    JOIN users u ON u.id = br.owner_id
    WHERE br.requester_id = ${user.id}
    ORDER BY 
      CASE WHEN br.status = 'pending' THEN 0 ELSE 1 END,
      br.created_at DESC
    LIMIT 50
  `

  const pendingIncoming = incomingRequests.filter(r => r.status === 'pending').length
  const pendingOutgoing = outgoingRequests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Borrow Requests</h1>
        <p className="text-muted-foreground">
          Manage incoming and outgoing book requests
        </p>
      </div>

      <Tabs defaultValue="incoming">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="incoming" className="gap-2">
            <Inbox className="h-4 w-4" />
            Incoming
            {pendingIncoming > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {pendingIncoming}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-2">
            <Send className="h-4 w-4" />
            Outgoing
            {pendingOutgoing > 0 && (
              <span className="bg-secondary text-secondary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {pendingOutgoing}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-6">
          <IncomingRequests requests={incomingRequests} />
        </TabsContent>

        <TabsContent value="outgoing" className="mt-6">
          <OutgoingRequests requests={outgoingRequests} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
