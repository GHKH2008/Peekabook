'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { searchGoogleBooks, parseGoogleBook, type GoogleBook } from '@/lib/google-books'
import { revalidatePath } from 'next/cache'

export async function searchBooks(query: string, langRestrict?: string): Promise<GoogleBook[]> {
  return searchGoogleBooks(query, langRestrict === 'all' ? undefined : langRestrict)
}

export type BookActionResult = {
  success: boolean
  error?: string
  bookId?: number
}

export async function addBookToLibrary(googleBook: GoogleBook): Promise<BookActionResult> {
  const user = await requireAuth()
  
  const bookData = parseGoogleBook(googleBook)
  
  // Check if book already exists in user's library
  const existing = await sql`
    SELECT id FROM books 
    WHERE user_id = ${user.id} 
    AND google_books_id = ${bookData.google_books_id}
  `
  
  if (existing.length > 0) {
    return { success: false, error: 'This book is already in your library' }
  }
  
  const result = await sql`
    INSERT INTO books (
      user_id, google_books_id, title, authors, summary, genres,
      isbn, isbn_13, language, cover_url, publisher, published_date,
      page_count, is_adult
    ) VALUES (
      ${user.id}, ${bookData.google_books_id}, ${bookData.title}, 
      ${bookData.authors}, ${bookData.summary}, ${bookData.genres},
      ${bookData.isbn}, ${bookData.isbn_13}, ${bookData.language},
      ${bookData.cover_url}, ${bookData.publisher}, ${bookData.published_date},
      ${bookData.page_count}, ${bookData.is_adult}
    )
    RETURNING id
  `
  
  revalidatePath('/library')
  revalidatePath('/dashboard')
  
  return { success: true, bookId: result[0].id }
}

export async function updateBook(
  bookId: number,
  data: {
    visibility?: 'public' | 'friends' | 'private'
    availability?: 'available' | 'requested' | 'loaned' | 'unavailable'
    is_adult?: boolean
  }
): Promise<BookActionResult> {
  const user = await requireAuth()
  
  // Verify ownership
  const book = await sql`
    SELECT id FROM books WHERE id = ${bookId} AND user_id = ${user.id}
  `
  
  if (book.length === 0) {
    return { success: false, error: 'Book not found or you do not own it' }
  }
  
  const updates: string[] = []
  
  if (data.visibility !== undefined) {
    await sql`UPDATE books SET visibility = ${data.visibility} WHERE id = ${bookId}`
  }
  if (data.availability !== undefined) {
    await sql`UPDATE books SET availability = ${data.availability} WHERE id = ${bookId}`
  }
  if (data.is_adult !== undefined) {
    await sql`UPDATE books SET is_adult = ${data.is_adult} WHERE id = ${bookId}`
  }
  
  await sql`UPDATE books SET updated_at = NOW() WHERE id = ${bookId}`
  
  revalidatePath('/library')
  revalidatePath(`/book/${bookId}`)
  
  return { success: true }
}

export async function deleteBook(bookId: number): Promise<BookActionResult> {
  const user = await requireAuth()
  
  // Verify ownership
  const book = await sql`
    SELECT id FROM books WHERE id = ${bookId} AND user_id = ${user.id}
  `
  
  if (book.length === 0) {
    return { success: false, error: 'Book not found or you do not own it' }
  }
  
  await sql`DELETE FROM books WHERE id = ${bookId}`
  
  revalidatePath('/library')
  revalidatePath('/dashboard')
  
  return { success: true }
}
