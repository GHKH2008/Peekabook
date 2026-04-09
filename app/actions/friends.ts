'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type FriendActionResult = {
  success: boolean
  error?: string
}

export async function sendFriendRequest(friendId: number): Promise<FriendActionResult> {
  const user = await requireAuth()
  
  if (friendId === user.id) {
    return { success: false, error: 'Cannot send friend request to yourself' }
  }
  
  // Check if friendship already exists
  const existing = await sql`
    SELECT id, status FROM friendships 
    WHERE (user_id = ${user.id} AND friend_id = ${friendId})
       OR (friend_id = ${user.id} AND user_id = ${friendId})
  `
  
  if (existing.length > 0) {
    const status = existing[0].status
    if (status === 'accepted') {
      return { success: false, error: 'You are already friends' }
    }
    if (status === 'pending') {
      return { success: false, error: 'Friend request already pending' }
    }
    if (status === 'blocked') {
      return { success: false, error: 'Cannot send friend request' }
    }
  }
  
  await sql`
    INSERT INTO friendships (user_id, friend_id, status)
    VALUES (${user.id}, ${friendId}, 'pending')
  `
  
  revalidatePath('/friends')
  revalidatePath('/users')
  
  return { success: true }
}

export async function acceptFriendRequest(friendshipId: number): Promise<FriendActionResult> {
  const user = await requireAuth()
  
  // Verify this request is for the current user
  const friendship = await sql`
    SELECT * FROM friendships 
    WHERE id = ${friendshipId} AND friend_id = ${user.id} AND status = 'pending'
  `
  
  if (friendship.length === 0) {
    return { success: false, error: 'Friend request not found' }
  }
  
  await sql`
    UPDATE friendships SET status = 'accepted', updated_at = NOW()
    WHERE id = ${friendshipId}
  `
  
  revalidatePath('/friends')
  revalidatePath('/dashboard')
  
  return { success: true }
}

export async function rejectFriendRequest(friendshipId: number): Promise<FriendActionResult> {
  const user = await requireAuth()
  
  const friendship = await sql`
    SELECT * FROM friendships 
    WHERE id = ${friendshipId} AND friend_id = ${user.id} AND status = 'pending'
  `
  
  if (friendship.length === 0) {
    return { success: false, error: 'Friend request not found' }
  }
  
  await sql`
    UPDATE friendships SET status = 'rejected', updated_at = NOW()
    WHERE id = ${friendshipId}
  `
  
  revalidatePath('/friends')
  
  return { success: true }
}

export async function removeFriend(friendId: number): Promise<FriendActionResult> {
  const user = await requireAuth()
  
  await sql`
    DELETE FROM friendships 
    WHERE status = 'accepted'
      AND ((user_id = ${user.id} AND friend_id = ${friendId})
        OR (friend_id = ${user.id} AND user_id = ${friendId}))
  `
  
  revalidatePath('/friends')
  revalidatePath('/dashboard')
  
  return { success: true }
}

export async function blockUser(userId: number): Promise<FriendActionResult> {
  const user = await requireAuth()
  
  // Remove existing friendship if any
  await sql`
    DELETE FROM friendships 
    WHERE (user_id = ${user.id} AND friend_id = ${userId})
       OR (friend_id = ${user.id} AND user_id = ${userId})
  `
  
  // Create blocked relationship
  await sql`
    INSERT INTO friendships (user_id, friend_id, status)
    VALUES (${user.id}, ${userId}, 'blocked')
  `
  
  revalidatePath('/friends')
  
  return { success: true }
}
