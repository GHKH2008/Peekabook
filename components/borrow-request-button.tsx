'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { BookMarked, Check } from 'lucide-react'
import { createBorrowRequest } from '@/app/actions/borrow'

export function BorrowRequestButton({
  bookId,
  ownerId,
}: {
  bookId: number
  ownerId: number
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [isPending, setIsPending] = useState(false)
  const [isRequested, setIsRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsPending(true)
    setError(null)

    const result = await createBorrowRequest(bookId, ownerId, message || undefined)
    
    if (result.success) {
      setIsRequested(true)
      setOpen(false)
    } else {
      setError(result.error || 'Failed to send request')
    }
    
    setIsPending(false)
  }

  if (isRequested) {
    return (
      <Button disabled className="gap-2">
        <Check className="h-4 w-4" />
        Request Sent
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <BookMarked className="h-4 w-4" />
          Request to Borrow
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request to Borrow</DialogTitle>
          <DialogDescription>
            Send a request to the book owner. They&apos;ll be notified and can approve or decline.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Field className="py-4">
            <FieldLabel htmlFor="message">Message (optional)</FieldLabel>
            <Textarea
              id="message"
              placeholder="Add a message to your request..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </Field>
          {error && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner className="mr-2 h-4 w-4" />}
              Send Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
