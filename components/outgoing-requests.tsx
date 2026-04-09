import Link from 'next/link'
import Image from 'next/image'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Send } from 'lucide-react'

type Request = {
  id: number
  book_id: number
  status: string
  message: string | null
  created_at: string
  book_title: string
  cover_url: string | null
  authors: string[] | null
  owner_username: string
  owner_name: string | null
  owner_avatar: string | null
}

export function OutgoingRequests({ requests }: { requests: Request[] }) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Send className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-medium mb-2">No outgoing requests</h3>
          <p className="text-muted-foreground">
            {"When you request to borrow books, they'll appear here"}
          </p>
        </CardContent>
      </Card>
    )
  }

  const statusColors = {
    pending: 'bg-chart-4 text-foreground',
    approved: 'bg-accent text-accent-foreground',
    rejected: 'bg-destructive text-destructive-foreground',
    cancelled: 'bg-muted text-muted-foreground',
  }

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.id}>
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
                    {request.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">From:</span>
                  <Link href={`/user/${request.owner_username}`}>
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={request.owner_avatar || undefined} />
                      <AvatarFallback className="text-xs">
                        {(request.owner_name || request.owner_username).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <Link href={`/user/${request.owner_username}`} className="text-sm hover:underline">
                    {request.owner_name || request.owner_username}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {new Date(request.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
