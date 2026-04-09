'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type SettingsResult = {
  success: boolean
  error?: string
}

export async function updateProfile(formData: FormData): Promise<SettingsResult> {
  const user = await requireAuth()
  
  const displayName = formData.get('displayName') as string
  const bio = formData.get('bio') as string
  const avatarUrl = formData.get('avatarUrl') as string

  if (displayName && displayName.length > 100) {
    return { success: false, error: 'Display name must be less than 100 characters' }
  }

  if (bio && bio.length > 500) {
    return { success: false, error: 'Bio must be less than 500 characters' }
  }

  await sql`
    UPDATE users 
    SET 
      display_name = ${displayName || null},
      bio = ${bio || null},
      avatar_url = ${avatarUrl || null},
      updated_at = NOW()
    WHERE id = ${user.id}
  `

  revalidatePath('/settings')
  revalidatePath(`/user/${user.username}`)
  revalidatePath('/dashboard')

  return { success: true }
}

export async function updatePrivacy(data: {
  profileVisibility?: 'public' | 'friends' | 'private'
  childSafeMode?: boolean
}): Promise<SettingsResult> {
  const user = await requireAuth()

  if (data.profileVisibility !== undefined) {
    await sql`
      UPDATE users 
      SET profile_visibility = ${data.profileVisibility}, updated_at = NOW()
      WHERE id = ${user.id}
    `
  }

  if (data.childSafeMode !== undefined) {
    await sql`
      UPDATE users 
      SET child_safe_mode = ${data.childSafeMode}, updated_at = NOW()
      WHERE id = ${user.id}
    `
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  revalidatePath('/friends')

  return { success: true }
}
