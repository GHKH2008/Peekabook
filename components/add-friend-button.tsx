'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { UserPlus, Check } from 'lucide-react'
import { sendFriendRequest } from '@/app/actions/friends'

export function AddFriendButton({ userId }: { userId: number }) {
  const [isPending, startTransition] = useTransition()
  const [isSent, setIsSent] = useState(false)

  async function handleClick() {
    startTransition(async () => {
      const result = await sendFriendRequest(userId)
      if (result.success) {
        setIsSent(true)
      }
    })
  }

  if (isSent) {
    return (
      <Button disabled className="gap-2">
        <Check className="h-4 w-4" />
        Request Sent
      </Button>
    )
  }

  return (
    <Button onClick={handleClick} disabled={isPending} className="gap-2">
      {isPending ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      Add Friend
    </Button>
  )
}
