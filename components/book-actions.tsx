'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Spinner } from '@/components/ui/spinner'
import { Trash2, Globe, Users, Lock } from 'lucide-react'
import { updateBook, deleteBook } from '@/app/actions/books'
import type { Book } from '@/lib/db'

export function BookActions({ book }: { book: Book }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleVisibilityChange(value: string) {
    startTransition(async () => {
      await updateBook(book.id, { visibility: value as any })
    })
  }

  async function handleAvailabilityChange(value: string) {
    startTransition(async () => {
      await updateBook(book.id, { availability: value as any })
    })
  }

  async function handleDelete() {
    setIsDeleting(true)
    const result = await deleteBook(book.id)
    if (result.success) {
      router.push('/library')
    }
    setIsDeleting(false)
  }

  return (
    <div className="flex flex-wrap gap-3 py-4 border-y border-border">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Visibility:</span>
        <Select
          value={book.visibility}
          onValueChange={handleVisibilityChange}
          disabled={isPending}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Public
              </div>
            </SelectItem>
            <SelectItem value="friends">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Friends
              </div>
            </SelectItem>
            <SelectItem value="private">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Private
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Select
          value={book.availability}
          onValueChange={handleAvailabilityChange}
          disabled={isPending}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="requested">Requested</SelectItem>
            <SelectItem value="loaned">Loaned</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-2 ml-auto">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this book?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &quot;{book.title}&quot; from your library.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Spinner className="mr-2 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
