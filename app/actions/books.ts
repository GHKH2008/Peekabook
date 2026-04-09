'use server'

import { sql } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { searchBooksSequential } from '@/lib/book-search/orchestrator'
import type { EnglishBook } from '@/lib/book-search/types'

export type BookActionResult = {
  success: boolean
  error?: string
  bookId?: number
}

type CustomBookInput = {
  title: string
  author?: string
  summary?: string
  publisher?: string
  publishedDate?: string
}

type SearchBookInput = {
  title: string
  series?: string
  authors?: string[]
  summary?: string
  genres?: string[]
  isbn?: string
  isbn13?: string
  language?: string
  cover?: string
  publisher?: string
  publishedDate?: string
  pageCount?: number
  sourceRefs?: Record<string, string | undefined>
  sourceTrace?: string[]
}

export async function searchBooks(query: string): Promise<EnglishBook[]> {
  await requireAuth()

  const trimmed = query.trim()
  if (!trimmed) return []

  return searchBooksSequential(trimmed)
}

export async function addSearchedBookToLibrary(data: SearchBookInput): Promise<BookActionResult> {
  const user = await requireAuth()

  const title = data.title.trim()
  if (!title) {
    return { success: false, error: 'Title is required' }
  }

  const authors = (data.authors ?? []).map((a) => a.trim()).filter(Boolean)
  const primaryAuthor = authors[0]?.toLowerCase() ?? null

  const existing = await sql`
    SELECT id
    FROM books
    WHERE user_id = ${user.id}
      AND (
        (${data.isbn13 || null} IS NOT NULL AND isbn_13 = ${data.isbn13 || null})
        OR (${data.isbn || null} IS NOT NULL AND isbn = ${data.isbn || null})
        OR (
          lower(title) = ${title.toLowerCase()}
          AND (
            (${primaryAuthor} IS NULL AND (authors IS NULL OR array_length(authors, 1) = 0))
            OR (${primaryAuthor} IS NOT NULL AND lower(COALESCE(authors[1], '')) = ${primaryAuthor})
          )
        )
      )
    LIMIT 1
  `

  if (existing.length > 0) {
    return { success: false, error: 'A matching book already exists in your library' }
  }

  const result = await sql`
    INSERT INTO books (
      user_id,
      title,
      authors,
      summary,
      genres,
      isbn,
      isbn_13,
      language,
      cover_url,
      publisher,
      published_date,
      page_count,
      source_refs,
      source_trace
    ) VALUES (
      ${user.id},
      ${title},
      ${authors.length ? authors : null},
      ${data.summary?.trim() || null},
      ${data.genres?.length ? data.genres : null},
      ${data.isbn?.trim() || null},
      ${data.isbn13?.trim() || null},
      ${data.language?.trim() || null},
      ${data.cover?.trim() || null},
      ${data.publisher?.trim() || null},
      ${data.publishedDate?.trim() || null},
      ${data.pageCount || null},
      ${data.sourceRefs ? JSON.stringify(data.sourceRefs) : null}::jsonb,
      ${data.sourceTrace?.length ? data.sourceTrace : null}
    )
    RETURNING id
  `

  revalidatePath('/library')
  revalidatePath('/dashboard')

  return { success: true, bookId: result[0].id }
}

export async function addCustomBookToLibrary(data: CustomBookInput): Promise<BookActionResult> {
  const user = await requireAuth()

  const title = data.title.trim()
  const author = data.author?.trim()
  const summary = data.summary?.trim()
  const publisher = data.publisher?.trim()
  const publishedDate = data.publishedDate?.trim()

  if (!title) {
    return { success: false, error: 'Title is required' }
  }

  const existing = await sql`
    SELECT id
    FROM books
    WHERE user_id = ${user.id}
      AND lower(title) = ${title.toLowerCase()}
      AND (
        (${author ? author.toLowerCase() : null} IS NULL AND (authors IS NULL OR array_length(authors, 1) = 0))
        OR (${author ? author.toLowerCase() : null} IS NOT NULL AND lower(COALESCE(authors[1], '')) = ${author ? author.toLowerCase() : ''})
      )
    LIMIT 1
  `

  if (existing.length > 0) {
    return { success: false, error: 'A matching title/author already exists in your library' }
  }

  const result = await sql`
    INSERT INTO books (
      user_id, title, authors, summary, publisher, published_date
    ) VALUES (
      ${user.id}, ${title}, ${author ? [author] : null}, ${summary || null}, ${publisher || null}, ${publishedDate || null}
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

  const book = await sql`
    SELECT id FROM books WHERE id = ${bookId} AND user_id = ${user.id}
  `

  if (book.length === 0) {
    return { success: false, error: 'Book not found or you do not own it' }
  }

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
