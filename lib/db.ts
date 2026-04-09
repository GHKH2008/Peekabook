import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.DATABASE_URL!)

export type User = {
  id: number
  username: string
  email: string
  password_hash: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  child_safe_mode: boolean
  profile_visibility: 'public' | 'friends' | 'private'
  created_at: string
  updated_at: string
}

export type Book = {
  id: number
  user_id: number
  google_books_id: string | null
  title: string
  authors: string[] | null
  summary: string | null
  genres: string[] | null
  isbn: string | null
  isbn_13: string | null
  language: string | null
  cover_url: string | null
  publisher: string | null
  published_date: string | null
  page_count: number | null
  is_adult: boolean
  visibility: 'public' | 'friends' | 'private'
  availability: 'available' | 'requested' | 'loaned' | 'unavailable'
  created_at: string
  updated_at: string
}

export type Friendship = {
  id: number
  user_id: number
  friend_id: number
  status: 'pending' | 'accepted' | 'rejected' | 'blocked'
  created_at: string
  updated_at: string
}

export type BorrowRequest = {
  id: number
  book_id: number
  requester_id: number
  owner_id: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  message: string | null
  created_at: string
  updated_at: string
}

export type Loan = {
  id: number
  book_id: number
  borrower_id: number
  lender_id: number
  borrow_request_id: number | null
  status: 'active' | 'returned' | 'overdue'
  borrowed_at: string
  due_date: string | null
  returned_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type Session = {
  id: number
  user_id: number
  token: string
  expires_at: string
  created_at: string
}
