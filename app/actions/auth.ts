'use server'

import { sql } from '@/lib/db'
import { hashPassword, verifyPassword, createSession, destroySession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export type AuthResult = {
  success: boolean
  error?: string
}

export async function signup(formData: FormData): Promise<AuthResult> {
  const username = formData.get('username') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!username || !email || !password) {
    return { success: false, error: 'All fields are required' }
  }

  if (username.length < 3 || username.length > 50) {
    return { success: false, error: 'Username must be 3-50 characters' }
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { success: false, error: 'Username can only contain letters, numbers, and underscores' }
  }

  if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' }
  }

  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match' }
  }

  const existingUser = await sql`
    SELECT id FROM users WHERE username = ${username} OR email = ${email}
  `

  if (existingUser.length > 0) {
    return { success: false, error: 'Username or email already exists' }
  }

  const passwordHash = await hashPassword(password)

  const newUser = await sql`
    INSERT INTO users (username, email, password_hash, display_name)
    VALUES (${username}, ${email}, ${passwordHash}, ${username})
    RETURNING id
  `

  await createSession(newUser[0].id)
  redirect('/dashboard')
}

export async function login(formData: FormData): Promise<AuthResult> {
  const identifier = formData.get('identifier') as string
  const password = formData.get('password') as string

  if (!identifier || !password) {
    return { success: false, error: 'All fields are required' }
  }

  const users = await sql`
    SELECT * FROM users WHERE username = ${identifier} OR email = ${identifier}
  `

  if (users.length === 0) {
    return { success: false, error: 'Invalid credentials' }
  }

  const user = users[0]
  const isValid = await verifyPassword(password, user.password_hash)

  if (!isValid) {
    return { success: false, error: 'Invalid credentials' }
  }

  await createSession(user.id)
  redirect('/dashboard')
}

export async function logout(): Promise<void> {
  await destroySession()
  redirect('/login')
}
